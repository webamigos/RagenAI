/**
 * An end-to-end check of a running Ragen MCP server, one layer at a time.
 *
 * Each layer can fail while the one before it passes, and every failure
 * below the first looks the same from an MCP client — a tool that answers
 * with an error. The server's own `/health` says nothing about any of them:
 * it answers while the API behind it has no token vault or no vector store.
 * So the steps run in order, and each failure is reported with the layer it
 * points at:
 *
 *   1. initialize — the MCP server is reachable and accepts the header
 *   2. tools/list — it serves the three tools; no key is checked yet
 *   3. ragen_list_assistants — the key is valid, so the API and its vault work
 *   4. ragen_search_knowledge_base — retrieval works, so the vector store does
 *   5. ragen_chat (only when asked) — a model answers too
 *
 * Steps 3–5 need a real key and are skipped without one.
 */

export const EXPECTED_TOOLS = [
  'ragen_chat',
  'ragen_list_assistants',
  'ragen_search_knowledge_base',
] as const;

/** What the smoke test needs from an MCP client — the SDK's, in practice. */
export interface SmokeClient {
  connect(): Promise<{ name?: string; version?: string } | undefined>;
  listTools(): Promise<string[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

export type StepResult =
  | { step: string; outcome: 'ok'; detail: string }
  | { step: string; outcome: 'failed'; detail: string; hint: string }
  | { step: string; outcome: 'skipped'; detail: string };

export interface SmokeOptions {
  hasKey: boolean;
  /** The question for step 4. */
  query: string;
  /** A message for step 5; step 5 runs only when one is given. */
  chatMessage?: string;
}

/** The envelope every tool returns, from `src/client/ragen-api-client.ts`. */
type ToolEnvelope =
  | ({ success: true } & Record<string, unknown>)
  | { success: false; status?: number; error?: string };

/**
 * What a failed tool call most likely means, by the status apps/api (or the
 * MCP server's own fetch) produced. Worded for whoever runs the deployment,
 * because that is who runs this.
 */
export function hintForToolFailure(status: number | undefined): string {
  if (status === 0) {
    return 'The MCP server cannot reach the Ragen API. Check RAGEN_API_URL on the MCP server, and that the API is running.';
  }
  if (status === 401) {
    return 'The Ragen API rejected the key: it is wrong or deactivated, or the API cannot reach its token vault (RAGEN_TOKEN_VAULT_URL on the api service).';
  }
  if (status === 403) {
    return "The key's scope does not cover this request. A key created for one assistant only answers for that assistant.";
  }
  if (status !== undefined && status >= 500) {
    return 'The Ragen API failed. Check its logs: an unreachable vector store (QDRANT_URL on the api service), token vault or model provider is the usual cause.';
  }
  return 'The Ragen API refused the request. Its logs say why.';
}

/** What a failed connection most likely means. */
export function hintForConnectFailure(message: string): string {
  if (/\b401\b/.test(message)) {
    return 'The MCP server refused the connection: the Authorization header is missing or not "Bearer <key>".';
  }
  if (/\b404\b/.test(message)) {
    return 'Nothing answers MCP at this URL. It should end in /mcp.';
  }
  return 'The MCP server is not reachable at this URL. Check the address and that the server is running.';
}

function parseEnvelope(text: string): ToolEnvelope | undefined {
  try {
    return JSON.parse(text) as ToolEnvelope;
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one tool step: a result whose envelope says `success: true` passes,
 * anything else fails with the hint for its status.
 */
async function toolStep(
  client: SmokeClient,
  step: string,
  tool: string,
  args: Record<string, unknown>,
  describe: (envelope: Record<string, unknown>) => string,
): Promise<StepResult> {
  let text: string;
  try {
    text = await client.callTool(tool, args);
  } catch (error) {
    return {
      step,
      outcome: 'failed',
      detail: errorMessage(error),
      hint: 'The MCP server failed the call itself. Check its logs.',
    };
  }
  const envelope = parseEnvelope(text);
  if (!envelope) {
    return {
      step,
      outcome: 'failed',
      detail: text.slice(0, 200),
      hint: 'The tool answered with something that is not its JSON envelope. The MCP server and this script may be different versions.',
    };
  }
  if (envelope.success) {
    return { step, outcome: 'ok', detail: describe(envelope) };
  }
  return {
    step,
    outcome: 'failed',
    detail: `status ${envelope.status ?? '?'}: ${envelope.error ?? 'no message'}`,
    hint: hintForToolFailure(envelope.status),
  };
}

/**
 * Runs the steps in order and stops at the first failure: a later step could
 * only fail for the same reason, and would bury the one line that matters.
 */
export async function runSmoke(
  client: SmokeClient,
  options: SmokeOptions,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const failed = () => results.some((r) => r.outcome === 'failed');

  try {
    const info = await client.connect();
    results.push({
      step: 'initialize',
      outcome: 'ok',
      detail: `${info?.name ?? 'unknown server'} ${info?.version ?? ''}`.trim(),
    });
  } catch (error) {
    const message = errorMessage(error);
    results.push({
      step: 'initialize',
      outcome: 'failed',
      detail: message,
      hint: hintForConnectFailure(message),
    });
    return results;
  }

  try {
    try {
      const names = await client.listTools();
      const missing = EXPECTED_TOOLS.filter((name) => !names.includes(name));
      results.push(
        missing.length === 0
          ? { step: 'tools/list', outcome: 'ok', detail: names.join(', ') }
          : {
              step: 'tools/list',
              outcome: 'failed',
              detail: `missing ${missing.join(', ')}`,
              hint: 'The server is not the Ragen MCP server, or an older version of it.',
            },
      );
    } catch (error) {
      results.push({
        step: 'tools/list',
        outcome: 'failed',
        detail: errorMessage(error),
        hint: 'The MCP server accepted the connection but could not list its tools. Check its logs.',
      });
    }

    const keySteps = [
      'ragen_list_assistants',
      'ragen_search_knowledge_base',
      ...(options.chatMessage ? ['ragen_chat'] : []),
    ];
    if (!options.hasKey) {
      for (const step of keySteps) {
        results.push({
          step,
          outcome: 'skipped',
          detail: 'no RAGEN_API_KEY',
        });
      }
      return results;
    }

    if (!failed()) {
      results.push(
        await toolStep(
          client,
          'ragen_list_assistants',
          'ragen_list_assistants',
          {},
          (envelope) => {
            const assistants = (envelope.assistants ?? []) as {
              name?: string;
            }[];
            return `${assistants.length} assistant(s): ${assistants
              .map((a) => a.name ?? '?')
              .join(', ')}`;
          },
        ),
      );
    }

    if (!failed()) {
      results.push(
        await toolStep(
          client,
          'ragen_search_knowledge_base',
          'ragen_search_knowledge_base',
          { query: options.query },
          (envelope) => {
            const fileIds = (envelope.file_ids ?? []) as unknown[];
            const context = String(envelope.context ?? '');
            return fileIds.length === 0
              ? 'no matching documents. Retrieval works, but this query found nothing'
              : `${fileIds.length} file(s), ${context.length} characters of context`;
          },
        ),
      );
    }

    if (options.chatMessage && !failed()) {
      results.push(
        await toolStep(
          client,
          'ragen_chat',
          'ragen_chat',
          { message: options.chatMessage },
          (envelope) => {
            const text = String(envelope.text ?? '');
            return text.length > 120 ? `${text.slice(0, 120)}…` : text;
          },
        ),
      );
    }

    return results;
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** One line per step, and the hint under a failure. */
export function formatResults(results: StepResult[]): string {
  const mark = { ok: '✓', failed: '✗', skipped: '-' } as const;
  return results
    .flatMap((r) => {
      const line = `${mark[r.outcome]} ${r.step}: ${r.detail}`;
      return r.outcome === 'failed' ? [line, `  → ${r.hint}`] : [line];
    })
    .join('\n');
}
