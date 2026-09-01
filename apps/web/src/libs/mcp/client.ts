import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { getProviderDefinition } from '@/features/connectors/constants/providers';
import type { ProviderDefinition } from '@/features/connectors/contracts/connector.types';
import {
  RagenAuthOAuthClientProvider,
  ragenAuthClient,
} from '@/libs/ragen-vault';
import { classifyMcpTool } from '@/libs/security/mcp-tool-classifier';
import { shouldPauseForApproval } from '@/libs/security/tool-gating-context';
import { inspectToolArgs } from '@/libs/security/tool-arg-inspector';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';

export type McpConnectorInfo = {
  id: string;
  provider: string;
  mcpServerUrl: string;
  customerId: string;
  organizationId: string;
  userId: string;
};

/**
 * Pick the MCP server URL to connect to for a given connector.
 *
 * Prefers the live value from `providers.ts` (which reads from env)
 * because that's what the deployer controls. Falls back to the
 * per-connector `mcpServerUrl` stored in the DB for providers that
 * legitimately carry per-org URLs — today only `api_key_custom_header`
 * (WooCommerce), where the URL is composed from the user's shop
 * address at registration time.
 *
 * Exported so the MCP client tests can assert the resolution rule
 * without spinning up a full client.
 */
export function resolveMcpServerUrl(
  connector: McpConnectorInfo,
  providerDef: ProviderDefinition | undefined,
): string {
  if (providerDef?.authType === 'api_key_custom_header') {
    return connector.mcpServerUrl;
  }
  if (providerDef?.mcpServerUrl) {
    return providerDef.mcpServerUrl;
  }
  // Missing provider definition — nothing better we can do than the
  // stored URL. Log a warning so the mismatch shows up in ops.
  logger.warn(
    {
      provider: connector.provider,
      storedUrl: connector.mcpServerUrl,
    },
    'resolveMcpServerUrl: no provider definition found, falling back to stored URL',
  );
  return connector.mcpServerUrl;
}

/**
 * Recursively replace PII alias tokens (e.g. <PL_NIP_1>) in tool arguments
 * with their original values before the args reach an external MCP server.
 * Only string values are substituted; numbers, booleans, and nulls pass through.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unmaskArgs(
  args: Record<string, any>,
  aliasMap: Record<string, string>,
): Record<string, any> {
  if (Object.keys(aliasMap).length === 0) {
    return args;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (value: any): any => {
    if (typeof value === 'string') {
      let result = value;
      for (const [alias, original] of Object.entries(aliasMap).sort(
        (a, b) => b[0].length - a[0].length,
      )) {
        result = result.replaceAll(alias, original);
      }
      return result;
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = walk(v);
      }
      return out;
    }
    return value;
  };
  return walk(args) as Record<string, unknown>;
}

/**
 * Mutate already-loaded MCP tools in-place to unmask PII aliases in arguments
 * before execution. Called after PII masking produces an aliasMap,
 * since tools are loaded earlier in the request lifecycle and the chain
 * holds a reference to the same object passed to initializeRagChain/initializeConversationChain.
 * Mutating in-place ensures the chain picks up the wrapped execute functions
 * without requiring re-initialization.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPiiUnmaskToTools(
  tools: Record<string, any>,
  aliasMap: Record<string, string>,
): void {
  if (Object.keys(aliasMap).length === 0) {
    return;
  }
  for (const [name, tool] of Object.entries(tools)) {
    if (typeof tool.execute === 'function') {
      const originalExecute = tool.execute;
      tools[name] = {
        ...tool,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: (args: Record<string, any>, options: any) =>
          originalExecute(unmaskArgs(args, aliasMap), options),
      };
    }
  }
}

/**
 * Strip empty/falsy optional args that models like GPT may fill with defaults
 * (e.g. empty strings, 0, empty arrays) instead of omitting.
 * These can cause MCP servers to interpret them as actual filters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeToolArgs(args: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === '' || value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    cleaned[key] = value;
  }

  // Strip keyword-search params when no keyword is present
  if (!cleaned.keyword) {
    delete cleaned.scope;
  }

  // Strip format if it's the default — avoids overriding server defaults
  if (cleaned.format === 'toon') {
    delete cleaned.format;
  }

  return cleaned;
}

/**
 * Wrap tool execute functions to:
 * 1. Sanitize args (strip empty values)
 * 2. Auto-inject customer_id from connector config (remove it from LLM-visible params)
 * 3. Attach `needsApproval` to write tools so the SDK pauses them when
 *    RAG context is present in the turn (Phase 2 prompt-injection gating)
 *
 * Exported for unit testing; the production call site is
 * `createMcpToolsFromConnectors` below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapToolsForConnector(
  tools: Record<string, any>,
  customerId: string,
): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (typeof tool.execute === 'function') {
      const originalExecute = tool.execute;

      // Remove `customer_id` from the tool's parameter schema so the
      // LLM never sees it. The schema shape exposed by @ai-sdk/mcp can
      // vary by SDK/MCP-server version — historically it was
      // `parameters.jsonSchema.properties.customer_id`, but newer MCP
      // servers surface parameters directly as `inputSchema` or at the
      // root of `parameters`. We strip from every known path. If the
      // key appears anywhere else we haven't seen, we warn so future
      // schema drift shows up in the logs before leaking to users.
      let parameters = tool.parameters;
      let inputSchema = tool.inputSchema;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stripKey = (schema: any): any => {
        if (!schema || typeof schema !== 'object') {
          return schema;
        }
        if (schema.properties && 'customer_id' in schema.properties) {
          const { customer_id: _, ...restProps } = schema.properties;
          const required = Array.isArray(schema.required)
            ? schema.required.filter((r: string) => r !== 'customer_id')
            : schema.required;
          return { ...schema, properties: restProps, required };
        }
        return schema;
      };

      if (parameters) {
        const strippedJson = stripKey(parameters.jsonSchema);
        const strippedInput = stripKey(parameters.inputSchema);
        const strippedDirect = stripKey(parameters);
        parameters = {
          ...parameters,
          ...(parameters.jsonSchema ? { jsonSchema: strippedJson } : {}),
          ...(parameters.inputSchema ? { inputSchema: strippedInput } : {}),
          ...(parameters.properties ? strippedDirect : {}),
        };

        // Detect any remaining leaks and log once per tool, with enough
        // shape detail for debugging without dumping the whole schema.
        const stillLeaks = JSON.stringify(parameters).includes('"customer_id"');
        if (stillLeaks) {
          logger.warn(
            {
              tool: name,
              keys: Object.keys(parameters ?? {}),
              jsonSchemaKeys: parameters?.jsonSchema
                ? Object.keys(parameters.jsonSchema)
                : null,
              jsonSchemaPropsKeys: parameters?.jsonSchema?.properties
                ? Object.keys(parameters.jsonSchema.properties)
                : null,
            },
            'wrapToolsForConnector: customer_id still present after strip — LLM will see it',
          );
        }
      }

      // AI SDK v6 MCP tools use `inputSchema` (not `parameters`).
      // Strip customer_id from the jsonSchema inside the inputSchema wrapper.
      if (inputSchema) {
        const rawSchema = inputSchema.jsonSchema;
        if (rawSchema) {
          const stripped = stripKey(rawSchema);
          if (stripped !== rawSchema) {
            inputSchema = { ...inputSchema, jsonSchema: stripped };
          }
        }
      }

      // Phase 2 prompt-injection defense: classify the tool and, if it
      // has side effects, attach a `needsApproval` predicate that pauses
      // execution when retrieved RAG context is present in the turn.
      // The AI SDK v6 pauses natively (emits a `tool-approval-request`
      // content part) when this returns true — we do NOT return a
      // sentinel from `execute` here, the SDK never calls `execute` in
      // the pause path.
      const sideEffect = classifyMcpTool(name);
      const isWrite = sideEffect === 'write';

      wrapped[name] = {
        ...tool,
        parameters,
        ...(inputSchema ? { inputSchema } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        needsApproval: isWrite
          ? (
              _input: Record<string, unknown>,
              options: {
                toolCallId: string;
                experimental_context?: unknown;
              },
            ) =>
              shouldPauseForApproval(
                options.experimental_context,
                options.toolCallId,
              )
          : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: (args: Record<string, any>, options: any) => {
          const cleaned = sanitizeToolArgs(args);
          cleaned.customer_id = customerId;
          logger.info(
            {
              toolName: name,
              sideEffect,
              originalArgCount: Object.keys(args).length,
              cleanedArgs: cleaned,
            },
            'Sanitized tool args',
          );

          // Phase 3 — exfiltration inspector. Only runs on write tools
          // because read tools can't leak outbound data by definition.
          // We inspect the cleaned args (post-sanitization, post-
          // customer_id injection) so the customer_id itself doesn't
          // trigger false positives — it's an opaque identifier, not
          // user content.
          if (isWrite) {
            // Exclude customer_id from inspection — it's a trusted
            // internal value, not attacker-controllable data.
            const { customer_id: _, ...userArgs } = cleaned;
            // inspectToolArgs is guaranteed not to throw — it wraps its
            // internal walker in a try/catch and falls back to
            // `{ risk: 'low', signals: [] }` on any error. No try/catch
            // needed here; see src/libs/security/tool-arg-inspector.ts.
            const inspection = inspectToolArgs(userArgs);

            if (inspection.risk !== 'low') {
              // Audit both medium and high — admins need the full
              // decision trail, not just blocks. Escalation rule
              // (Phase 0.5) bumps to critical on bursts of the same
              // user triggering TOOL_ARGS_HIGH_RISK.
              recordSecurityEvent({
                eventType: 'TOOL_ARGS_HIGH_RISK',
                severity: 'info',
                source: 'mcp',
                metadata: {
                  toolName: name,
                  risk: inspection.risk,
                  score: inspection.score,
                  signals: inspection.signals.map((s) => ({
                    type: s.type,
                    path: s.path,
                    weight: s.weight,
                    detail: s.detail,
                  })),
                },
              });
            }

            if (inspection.risk === 'high') {
              logger.warn(
                {
                  toolName: name,
                  score: inspection.score,
                  signalCount: inspection.signals.length,
                },
                'MCP tool call blocked: high-risk arguments',
              );
              // Return an error result the SDK hands back to the LLM.
              // The LLM surfaces this to the user in its next step.
              // NOTE: we do NOT throw — throwing interrupts the whole
              // stream. Returning a structured error lets the LLM
              // recover gracefully ("I tried to call X but the
              // arguments looked suspicious — please rephrase").
              return Promise.resolve({
                error: 'BLOCKED_SUSPICIOUS_ARGS',
                reason:
                  'The arguments to this tool contained potentially exfiltrated data (secrets, large encoded blobs, or high-entropy strings). The call was blocked. Rephrase your request and try again.',
                riskScore: inspection.score,
              });
            }
          }

          return originalExecute(cleaned, options);
        },
      };
    } else {
      wrapped[name] = tool;
    }
  }
  return wrapped;
}

/**
 * Create MCP clients for a list of connectors and gather their tools.
 * Returns merged tools and a cleanup function to close all clients.
 */
export async function createMcpToolsFromConnectors(
  connectors: McpConnectorInfo[],
) {
  const clients: MCPClient[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mergedTools: Record<string, any> = {};
  const loadedProviders: string[] = [];

  for (const connector of connectors) {
    try {
      const providerDef = getProviderDefinition(
        connector.provider as McpConnectorProvider,
      );

      // Resolve the MCP server URL at tool-load time rather than trusting
      // the value snapshotted on the connector row at connect time.
      //
      // Rationale: for fixed-URL providers (Google / ClickUp / HubSpot /
      // Fireflies) the authoritative URL is the env var read
      // by `providers.ts`. Using the stored value meant every
      // `MCP_*_SERVER_URL` env change required a disconnect+reconnect to
      // take effect — a silent footgun.
      //
      // Exception: `api_key_custom_header` (WooCommerce today) genuinely
      // stores a per-org URL composed from the user's shop address, so
      // the DB value is the source of truth there.
      const resolvedUrl = resolveMcpServerUrl(connector, providerDef);

      let client: MCPClient;

      if (providerDef?.authType === 'api_key_bearer') {
        // Read API key from ragen-vault and pass as Bearer token
        const customerId = connector.customerId;
        const tokenData = await ragenAuthClient.getToken(
          customerId,
          connector.provider,
        );

        if (!tokenData?.accessToken) {
          throw new Error(`No API key found for ${connector.provider}`);
        }

        client = await createMCPClient({
          transport: {
            type: 'http',
            url: resolvedUrl,
            headers: {
              Authorization: `Bearer ${tokenData.accessToken}`,
            },
          },
        });
      } else if (providerDef?.authType === 'api_key_custom_header') {
        // Read combined `${consumerKey}:${consumerSecret}` from the vault
        // and inject under the provider-defined header name (e.g.
        // WooCommerce uses `X-MCP-API-Key`).
        if (!providerDef.headerName) {
          throw new Error(`Provider ${connector.provider} missing headerName`);
        }
        const tokenData = await ragenAuthClient.getToken(
          connector.customerId,
          connector.provider,
        );
        if (!tokenData?.accessToken) {
          throw new Error(`No API key found for ${connector.provider}`);
        }

        client = await createMCPClient({
          transport: {
            type: 'http',
            url: resolvedUrl,
            headers: {
              [providerDef.headerName]: tokenData.accessToken,
            },
          },
        });
      } else if (providerDef?.authType === 'external_mcp') {
        const authProvider = new RagenAuthOAuthClientProvider({
          orgId: connector.organizationId,
          userId: connector.userId,
          provider: connector.provider as McpConnectorProvider,
          callbackUrl: '', // No redirect needed for runtime token injection
          fixedClientId: providerDef.oauthClientId,
          fixedClientSecret: providerDef.oauthClientSecret,
        });
        client = await createMCPClient({
          transport: {
            type: 'http',
            url: resolvedUrl,
            authProvider,
          },
        });
      } else {
        client = await createMCPClient({
          transport: {
            type: 'http',
            url: resolvedUrl,
            headers: {
              'x-customer-id': connector.customerId,
            },
          },
        });
      }

      clients.push(client);

      const tools = await client.tools();

      const wrappedTools = wrapToolsForConnector(tools, connector.customerId);

      const prefix = connector.provider.toLowerCase();
      for (const [name, tool] of Object.entries(wrappedTools)) {
        mergedTools[`${prefix}__${name}`] = tool;
      }

      loadedProviders.push(connector.provider);

      logger.info(
        {
          provider: connector.provider,
          toolCount: Object.keys(tools).length,
          toolNames: Object.keys(tools),
        },
        'MCP tools loaded from connector',
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: connector.provider,
          // Both: the URL stored on the connector row (what the user
          // connected with) and the URL we actually tried (what the
          // resolver picked from env). When they differ, the env var
          // changed between connects and the debug trail makes that
          // obvious.
          mcpServerUrlStored: connector.mcpServerUrl,
          mcpServerUrlTried: resolveMcpServerUrl(
            connector,
            getProviderDefinition(connector.provider as McpConnectorProvider),
          ),
        },
        'Failed to initialize MCP connector, skipping',
      );
    }
  }

  const closeAll = async () => {
    for (const client of clients) {
      try {
        await client.close();
      } catch (error) {
        logger.error({ err: error }, 'Error closing MCP client');
      }
    }
  };

  return {
    tools: mergedTools,
    loadedProviders,
    closeAll,
  };
}
