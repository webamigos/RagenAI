import {
  ApiError,
  createApiClient,
  normalizeUrl,
  unreachable,
  type Connection,
} from './api';
import { maskKey, type StoredConnection } from './config';
import { parseFlags } from './flags';

/**
 * `ragen doctor` — is this terminal set up to talk to an installation?
 *
 * Client-side on purpose. Whether the *installation* is configured well —
 * its env, its model routes, its queue — is a question for whoever runs it,
 * on the host (`npm run gateway:preflight` and the setup page answer it).
 * What a CLI user can check, and what goes wrong for them, is the path from
 * here: which URL and key are in use and where they came from, whether the
 * API answers, whether it accepts the key, and whether this CLI is current.
 */

export interface DoctorDeps {
  fetch: typeof fetch;
  /** The real environment — the stored connection is passed separately. */
  env: Record<string, string | undefined>;
  stored: StoredConnection | undefined;
  configPath: string;
  version: string;
  nodeVersion: string;
  out: (message: string) => void;
  err: (message: string) => void;
}

type Status = 'ok' | 'warn' | 'fail' | 'skip';

export interface Check {
  name: string;
  status: Status;
  detail: string;
  hint?: string;
}

/** The oldest Node this package's `engines` admits. */
export const MIN_NODE_MAJOR = 22;
/** Long enough for a cold API, short enough that a dead one does not hang. */
const TIMEOUT_MS = 5_000;

export async function runDoctor(
  args: string[],
  deps: DoctorDeps,
): Promise<number> {
  const flags = parseFlags(args, []);
  const checks: Check[] = [];

  checks.push(nodeCheck(deps.nodeVersion));
  checks.push(await versionCheck(deps));

  const { connection, checks: connectionChecks } = connectionFrom(
    flags.values,
    deps,
  );
  checks.push(...connectionChecks);
  if (connection) {
    checks.push(...(await apiChecks(deps, connection)));
  }

  if (flags.switches.has('--json')) {
    deps.out(JSON.stringify(checks, null, 2));
  } else {
    const mark: Record<Status, string> = {
      ok: 'ok  ',
      warn: 'warn',
      fail: 'FAIL',
      skip: '-   ',
    };
    for (const c of checks) {
      deps.out(`${mark[c.status]}  ${c.name.padEnd(10)} ${c.detail}`);
      if (c.hint) {
        deps.out(`      ${''.padEnd(10)} → ${c.hint}`);
      }
    }
  }
  // Non-zero on a failure, so `ragen doctor` can gate a script.
  return checks.some((c) => c.status === 'fail') ? 1 : 0;
}

export function nodeCheck(version: string): Check {
  const major = Number(/^v?(\d+)/.exec(version)?.[1]);
  return major >= MIN_NODE_MAJOR
    ? { name: 'node', status: 'ok', detail: version }
    : {
        name: 'node',
        status: 'fail',
        detail: `${version} is older than ${MIN_NODE_MAJOR}`,
        hint: `install Node ${MIN_NODE_MAJOR} or newer`,
      };
}

async function versionCheck(deps: DoctorDeps): Promise<Check> {
  try {
    const res = await deps.fetch(
      'https://registry.npmjs.org/ragen-cli/latest',
      {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const latest = ((await res.json()) as { version?: string }).version;
    if (!latest) {
      throw new Error('no version in the answer');
    }
    if (compareVersions(deps.version, latest) < 0) {
      return {
        name: 'cli',
        status: 'warn',
        detail: `ragen-cli ${deps.version}; ${latest} is out`,
        hint: 'npm install -g ragen-cli@latest',
      };
    }
    return { name: 'cli', status: 'ok', detail: `ragen-cli ${deps.version}` };
  } catch {
    // Offline is not a fault in the setup this command checks.
    return {
      name: 'cli',
      status: 'skip',
      detail: `ragen-cli ${deps.version}; could not ask npm for the latest`,
    };
  }
}

/** Which URL and key are in use, and where each came from. */
function connectionFrom(
  values: Map<string, string>,
  deps: DoctorDeps,
): { connection: Connection | undefined; checks: Check[] } {
  const pick = (flag: string, variable: string, saved: string | undefined) => {
    if (values.get(flag)) {
      return { value: values.get(flag)!, source: flag };
    }
    if (deps.env[variable]) {
      return { value: deps.env[variable]!, source: variable };
    }
    if (saved) {
      return { value: saved, source: deps.configPath };
    }
    return undefined;
  };
  const url = pick('--url', 'RAGEN_API_URL', deps.stored?.url);
  const key = pick('--api-key', 'RAGEN_API_KEY', deps.stored?.key);

  const checks: Check[] = [
    url
      ? {
          name: 'url',
          status: 'ok',
          detail: `${normalizeUrl(url.value)} (from ${url.source})`,
        }
      : {
          name: 'url',
          status: 'fail',
          detail: 'no API address',
          hint: 'ragen login --url https://api.example.com',
        },
    key
      ? {
          name: 'key',
          status: 'ok',
          detail: `${maskKey(key.value)} (from ${key.source})`,
        }
      : {
          name: 'key',
          status: 'fail',
          detail: 'no API key',
          hint: 'ragen login, with a key from Organization → API keys',
        },
  ];
  return {
    connection:
      url && key ? { url: normalizeUrl(url.value), key: key.value } : undefined,
    checks,
  };
}

async function apiChecks(
  deps: DoctorDeps,
  connection: Connection,
): Promise<Check[]> {
  // The health check takes no key, so it separates "nothing answers here"
  // from "something answers and refuses the key".
  try {
    const res = await deps.fetch(`${connection.url}/v1/healthcheck`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) {
      return [
        {
          name: 'api',
          status: 'fail',
          detail: `${connection.url} has no /v1/healthcheck`,
          hint: "use the API's address (apps/api, port 3001 locally), not the panel's",
        },
      ];
    }
    if (!res.ok) {
      return [
        {
          name: 'api',
          status: 'fail',
          detail: `the health check answered ${res.status}`,
        },
      ];
    }
  } catch (error) {
    return [
      {
        name: 'api',
        status: 'fail',
        detail: unreachable(connection.url, error).message,
        hint: 'check the address, and that the API is running',
      },
    ];
  }
  const checks: Check[] = [{ name: 'api', status: 'ok', detail: 'answers' }];

  const api = createApiClient(deps.fetch, connection);
  try {
    const models = await api<{ data: { id: string }[] }>('models');
    checks.push({ name: 'auth', status: 'ok', detail: 'the key is accepted' });
    checks.push(
      models.data.length > 0
        ? {
            name: 'models',
            status: 'ok',
            detail: models.data.map((m) => m.id).join(', '),
          }
        : {
            name: 'models',
            status: 'warn',
            detail: 'none available to this key',
            hint: 'chat will fail until the installation routes a model; ask its operator',
          },
    );
  } catch (error) {
    checks.push({
      name: 'auth',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
      hint:
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
          ? 'the key is wrong, revoked or deactivated; create one under Organization → API keys'
          : undefined,
    });
    return checks;
  }

  try {
    await api('brain/next');
    checks.push({ name: 'brain', status: 'ok', detail: 'on for this key' });
  } catch (error) {
    checks.push(
      error instanceof ApiError && error.status === 404
        ? {
            name: 'brain',
            status: 'skip',
            detail:
              "off for the organization, or the key's user is not an owner or admin",
          }
        : {
            name: 'brain',
            status: 'warn',
            detail: error instanceof Error ? error.message : String(error),
          },
    );
  }
  return checks;
}

/** Plain `major.minor.patch` comparison; a pre-release reads as its release. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .split('-')[0]!
      .split('.')
      .map((n) => Number(n) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  return 0;
}
