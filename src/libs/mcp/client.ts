import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { getProviderDefinition } from '@/features/connectors/constants/providers';
import {
  RagenAuthOAuthClientProvider,
  ragenAuthClient,
} from '@/libs/ragen-vault';

export type McpConnectorInfo = {
  id: string;
  provider: string;
  mcpServerUrl: string;
  customerId: string;
  organizationId: string;
  userId: string;
};

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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapToolsForConnector(
  tools: Record<string, any>,
  customerId: string,
): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (typeof tool.execute === 'function') {
      const originalExecute = tool.execute;

      // Remove customer_id from the tool's parameter schema so the LLM doesn't see it
      let parameters = tool.parameters;
      if (parameters?.jsonSchema?.properties?.customer_id) {
        const { customer_id: _, ...restProps } =
          parameters.jsonSchema.properties;
        const required = (
          Array.isArray(parameters.jsonSchema.required)
            ? parameters.jsonSchema.required
            : []
        ).filter((r: string) => r !== 'customer_id');
        parameters = {
          ...parameters,
          jsonSchema: {
            ...parameters.jsonSchema,
            properties: restProps,
            required,
          },
        };
      }

      wrapped[name] = {
        ...tool,
        parameters,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: (args: Record<string, any>, options: any) => {
          const cleaned = sanitizeToolArgs(args);
          // Inject customer_id from connector config
          cleaned.customer_id = customerId;
          logger.info(
            {
              toolName: name,
              originalArgCount: Object.keys(args).length,
              cleanedArgs: cleaned,
            },
            'Sanitized tool args',
          );
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
            url: connector.mcpServerUrl,
            headers: {
              Authorization: `Bearer ${tokenData.accessToken}`,
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
            url: connector.mcpServerUrl,
            authProvider,
          },
        });
      } else {
        client = await createMCPClient({
          transport: {
            type: 'http',
            url: connector.mcpServerUrl,
            headers: {
              'x-customer-id': connector.customerId,
            },
          },
        });
      }

      clients.push(client);

      const tools = await client.tools();

      // Wrap tools: inject customer_id, strip it from LLM params, sanitize args
      const wrappedTools = wrapToolsForConnector(tools, connector.customerId);

      // Prefix tool names with provider to avoid collisions
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
          mcpServerUrl: connector.mcpServerUrl,
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
