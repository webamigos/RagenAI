import { CONNECTION_HELP, createApiClient, resolveConnection } from './api';
import { parseFlags, positiveInt } from './flags';

/**
 * `ragen search <query>` — retrieval without an answer, over `/v1/search`.
 *
 * It prints the same context block the chat endpoint hands its answer model,
 * which is what makes it useful: when an answer is wrong, this shows whether
 * retrieval found the right passage or the model ignored it.
 */

export interface SearchDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  out: (message: string) => void;
  err: (message: string) => void;
}

const USAGE = [
  'Usage',
  '  ragen search <query> [options]',
  '',
  'Prints the passages chat would answer from, and the files they came from.',
  '',
  'Options',
  '  --assistant <id>      search this assistant (or RAGEN_ASSISTANT_ID); the key must allow it',
  '  --max <n>             at most n passages, 1–20 (default: the organization’s setting)',
  CONNECTION_HELP,
  '  --json                print the API response as JSON',
].join('\n');

export async function runSearch(
  args: string[],
  deps: SearchDeps,
): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    deps.out(USAGE);
    return args.length === 0 ? 1 : 0;
  }
  try {
    const flags = parseFlags(args, ['--assistant', '--max']);
    const query = flags.positional.join(' ').trim();
    if (!query) {
      deps.err('Search for something: ragen search "refund policy"');
      return 1;
    }
    const connection = resolveConnection(flags, deps.env);
    if (!connection) {
      deps.err(
        'Set RAGEN_API_URL and RAGEN_API_KEY (or pass --url and --api-key).',
      );
      return 1;
    }
    const api = createApiClient(deps.fetch, connection);
    const assistant =
      flags.values.get('--assistant') ?? deps.env.RAGEN_ASSISTANT_ID;
    const max = positiveInt(flags, '--max');

    const result = await api<{ context: string; file_ids: string[] }>(
      'search',
      {
        method: 'POST',
        body: {
          query,
          ...(assistant ? { assistant_id: assistant } : {}),
          ...(max ? { max_results: max } : {}),
        },
        notFound:
          'No such assistant for this key. Pass --assistant <id> or set RAGEN_ASSISTANT_ID.',
      },
    );

    if (flags.switches.has('--json')) {
      deps.out(JSON.stringify(result, null, 2));
      return 0;
    }
    if (!result.context.trim()) {
      deps.out('Nothing relevant found.');
      return 0;
    }
    deps.out(result.context);
    if (result.file_ids.length > 0) {
      // `/v1/search` answers with bare ids where `/v1/files` uses `file-…`;
      // printed the way `ragen kb` prints them, one can be pasted into the other.
      const ids = result.file_ids.map((id) =>
        id.startsWith('file-') ? id : `file-${id}`,
      );
      deps.out(`\nFrom ${ids.length} file(s): ${ids.join(', ')}`);
    }
    return 0;
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
