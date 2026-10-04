import {
  CONNECTION_HELP,
  NO_CONNECTION,
  createApiClient,
  resolveConnection,
} from './api';
import { parseFlags, positiveInt } from './flags';

/**
 * `ragen assistants ls` — the assistants a key can see, over
 * `/v1/assistants`. Mostly so `--assistant <id>` and RAGEN_ASSISTANT_ID have
 * somewhere to come from without opening the panel.
 */

export interface AssistantsDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  out: (message: string) => void;
  err: (message: string) => void;
}

interface ApiAssistant {
  id: string;
  name: string;
  model: string;
  description: string | null;
}

const USAGE = [
  'Usage',
  '  ragen assistants ls [--limit <n>] [--json]',
  '',
  'Use an id with `ragen ask --assistant <id>`, `ragen search --assistant <id>`,',
  'or export it as RAGEN_ASSISTANT_ID.',
  '',
  'Options',
  CONNECTION_HELP,
].join('\n');

export async function runAssistants(
  args: string[],
  deps: AssistantsDeps,
): Promise<number> {
  const [command, ...rest] = args;
  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    deps.out(USAGE);
    return command ? 0 : 1;
  }
  if (command !== 'ls' && command !== 'list') {
    deps.err(`Unknown assistants command: ${command}\n\n${USAGE}`);
    return 1;
  }
  try {
    const flags = parseFlags(rest, ['--limit']);
    const connection = resolveConnection(flags, deps.env);
    if (!connection) {
      deps.err(NO_CONNECTION);
      return 1;
    }
    const api = createApiClient(deps.fetch, connection);
    const page = await api<{ data: ApiAssistant[] }>('assistants', {
      // The API caps a page at 100.
      query: { limit: Math.min(positiveInt(flags, '--limit') ?? 100, 100) },
    });
    if (flags.switches.has('--json')) {
      deps.out(JSON.stringify(page.data, null, 2));
      return 0;
    }
    if (page.data.length === 0) {
      deps.out(
        'No assistants for this key. A key scoped to one assistant sees only that one.',
      );
      return 0;
    }
    const width = Math.max(...page.data.map((a) => a.name.length));
    deps.out(
      page.data
        .map((a) => `${a.id}  ${a.name.padEnd(width)}  ${a.model}`)
        .join('\n'),
    );
    return 0;
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
