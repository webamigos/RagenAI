import { createApiClient, normalizeUrl } from './api';
import { parseFlags } from './flags';
import { maskKey, type StoredConnection } from './config';

/**
 * `ragen login` and `ragen logout` — save, and forget, the connection every
 * other command uses.
 *
 * There is no identity endpoint to sign in against, and none is needed: an
 * API key already names its organization and scope. Logging in is checking
 * that the key is accepted — `GET /v1/models`, which every key may call — and
 * writing it down. A key the server refuses is never saved, so a typo does
 * not become every later command's "The API key was refused".
 */

export interface LoginDeps {
  fetch: typeof fetch;
  /** The real environment — not merged with a stored connection. */
  env: Record<string, string | undefined>;
  configPath: string;
  /**
   * The key, when no flag or variable gave one: a hidden prompt on a
   * terminal, or the first line of stdin when it is piped. Kept out of argv by
   * default, because argv lands in shell history and `ps`.
   */
  readKey: () => Promise<string>;
  saveConfig: (path: string, content: string) => Promise<void>;
  /** Resolves `false` when there was no file to remove. */
  removeConfig: (path: string) => Promise<boolean>;
  out: (message: string) => void;
  err: (message: string) => void;
}

const LOGIN_USAGE = [
  'Usage',
  '  ragen login --url <api-url>      then paste the API key when asked',
  '  echo "$KEY" | ragen login --url <api-url>',
  '',
  'Checks the key against the installation and saves both, readable only by',
  'you, so later commands need neither RAGEN_API_URL nor RAGEN_API_KEY.',
  'The environment and --url/--api-key still win over what is saved.',
].join('\n');

export async function runLogin(
  args: string[],
  deps: LoginDeps,
): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    deps.out(LOGIN_USAGE);
    return 0;
  }
  const flags = parseFlags(args, []);
  const url = normalizeUrl(flags.values.get('--url') ?? deps.env.RAGEN_API_URL);
  if (!url) {
    deps.err(
      'Name the installation: ragen login --url https://api.example.com',
    );
    return 1;
  }
  if (!/^https?:\/\//.test(url)) {
    deps.err(`${url} is not an http(s) address.`);
    return 1;
  }

  try {
    const key = (
      flags.values.get('--api-key') ??
      deps.env.RAGEN_API_KEY ??
      (await deps.readKey())
    ).trim();
    if (!key) {
      deps.err('No API key given. Create one under Organization → API keys.');
      return 1;
    }

    const api = createApiClient(deps.fetch, { url, key });
    const models = await api<{ data: unknown[] }>('models', {
      notFound: `${url} answered 404 for /v1/models — is this the API's address rather than the panel's?`,
    });

    const stored: StoredConnection = { url, key };
    await deps.saveConfig(
      deps.configPath,
      `${JSON.stringify(stored, null, 2)}\n`,
    );
    deps.out(
      `Logged in to ${url} with ${maskKey(key)} (${models.data.length} model(s) available).`,
    );
    deps.out(`Saved to ${deps.configPath}`);
    if (!url.startsWith('https://') && !isLoopback(url)) {
      deps.err(
        'Warning: this installation is reached over plain http, so the key travels unencrypted.',
      );
    }
    return 0;
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    deps.err('Nothing was saved.');
    return 1;
  }
}

export async function runLogout(
  _args: string[],
  deps: Pick<LoginDeps, 'configPath' | 'removeConfig' | 'out'>,
): Promise<number> {
  const removed = await deps.removeConfig(deps.configPath);
  deps.out(
    removed
      ? `Logged out: removed ${deps.configPath}`
      : 'Not logged in: there was no saved connection.',
  );
  return 0;
}

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}
