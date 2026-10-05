import { basename } from 'node:path';

import {
  ApiError,
  CONNECTION_HELP,
  NO_CONNECTION,
  createApiClient,
  resolveConnection,
  type ApiClient,
} from './api';
import { parseFlags, positiveInt, type Flags } from './flags';

/**
 * `ragen kb …` — the knowledge base's files, over `/v1/files`.
 *
 * An API key is enough: it carries the organization and a scope, and the
 * scope decides which files a key sees and where an upload lands — a
 * knowledge-base key works on the files that belong to no assistant, an
 * assistant key on that assistant's. The CLI does not choose; it could only
 * disagree with the server.
 */

export interface KbDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  readFile: (path: string) => Promise<Uint8Array>;
  /** Injected so a test of `--wait` does not take minutes. */
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  out: (message: string) => void;
  err: (message: string) => void;
}

export interface ApiFile {
  id: string;
  bytes: number;
  created_at: number;
  filename: string;
  status: 'uploaded' | 'processed' | 'error';
}

const USAGE = [
  'Usage',
  '  ragen kb <command> [options]',
  '',
  'Commands',
  '  ls                    files, newest first (--limit <n>, --all for every page)',
  '  upload <file...>      upload and start indexing (--wait until indexed, --timeout <s>)',
  '  status <file-id...>   where each file is: uploaded, processed or error (--wait)',
  '  rm <file-id...>       delete files and their chunks',
  '',
  'The API key decides where files go: a knowledge-base key uses the shared',
  "knowledge base, an assistant key that assistant's files.",
  '',
  'Options',
  CONNECTION_HELP,
  '  --json                print the API response as JSON',
].join('\n');

const VALUE_FLAGS = ['--limit', '--timeout'];

/**
 * How often `--wait` asks. Ingest takes seconds to minutes, and the API allows
 * reading `/v1/files` 20 times a minute per address — 7.5 a minute leaves room
 * for the uploads and deletes around it.
 */
export const POLL_INTERVAL_MS = 8_000;
const DEFAULT_TIMEOUT_S = 600;
/** A rate-limited request is tried this many times before giving up. */
const RATE_LIMIT_ATTEMPTS = 3;
/**
 * The longest wait worth sitting out. The throttlers ask for 60 s at most; a
 * larger `Retry-After` is not a per-minute limit, and is treated as final.
 */
const MAX_RETRY_S = 120;

export async function runKb(args: string[], deps: KbDeps): Promise<number> {
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
  try {
    const flags = parseFlags(rest, VALUE_FLAGS);
    const connection = resolveConnection(flags, deps.env);
    if (!connection) {
      deps.err(NO_CONNECTION);
      return 1;
    }
    const api = createApiClient(deps.fetch, connection);

    switch (command) {
      case 'ls':
      case 'list':
        return await list(deps, api, flags);
      case 'upload':
        return await upload(deps, api, flags);
      case 'status':
        return await status(deps, api, flags);
      case 'rm':
      case 'delete':
        return await remove(deps, api, flags);
      default:
        deps.err(`Unknown kb command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function list(deps: KbDeps, api: ApiClient, flags: Flags) {
  const limit = positiveInt(flags, '--limit') ?? 20;
  const all = flags.switches.has('--all');
  // The API caps a page at 100; asking for more is a 400.
  const pageSize = all ? 100 : Math.min(limit, 100);
  const files: ApiFile[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await api<{ data: ApiFile[] }>('files', {
      query: { limit: pageSize, after },
    });
    files.push(...page.data);
    // No `has_more` in the envelope: a short page is the last one.
    if (page.data.length < pageSize || (!all && files.length >= limit)) {
      break;
    }
    after = page.data[page.data.length - 1]!.id;
  }
  const shown = all ? files : files.slice(0, limit);
  if (flags.switches.has('--json')) {
    deps.out(JSON.stringify(shown, null, 2));
  } else {
    deps.out(shown.length === 0 ? 'No files.' : shown.map(fileRow).join('\n'));
  }
  return 0;
}

async function status(deps: KbDeps, api: ApiClient, flags: Flags) {
  const ids = flags.positional;
  if (ids.length === 0) {
    deps.err('Name a file: ragen kb status <file-id>');
    return 1;
  }
  const json = flags.switches.has('--json');
  const found = await refresh(api, ids);
  let files = ids.map((id) => found.get(id)!);
  let failed = 0;
  if (flags.switches.has('--wait')) {
    const timeoutS = positiveInt(flags, '--timeout') ?? DEFAULT_TIMEOUT_S;
    const waited = await waitForIndex(deps, api, files, timeoutS, json);
    files = waited.files;
    failed = waited.failed;
  }
  if (json) {
    deps.out(JSON.stringify(files, null, 2));
  } else {
    deps.out(files.map(fileRow).join('\n'));
  }
  // Non-zero when a file failed to index (or, waiting, did not finish), so a
  // script can gate on it.
  return failed > 0 || files.some((f) => f.status === 'error') ? 1 : 0;
}

/**
 * The current state of these files, in as few requests as the API allows:
 * one page of the newest files, then by id for any not on it. Reading
 * `/v1/files` is limited to 20 a minute per address in production, so a
 * request per file per round would be refused for any sizeable batch.
 */
async function refresh(
  api: ApiClient,
  ids: string[],
): Promise<Map<string, ApiFile>> {
  const wanted = new Set(ids);
  const found = new Map<string, ApiFile>();
  const page = await api<{ data: ApiFile[] }>('files', {
    query: { limit: 100 },
  });
  for (const file of page.data) {
    if (wanted.has(file.id)) {
      found.set(file.id, file);
    }
  }
  for (const id of ids) {
    if (!found.has(id)) {
      found.set(id, await getFile(api, id));
    }
  }
  return found;
}

async function remove(deps: KbDeps, api: ApiClient, flags: Flags) {
  const ids = flags.positional;
  if (ids.length === 0) {
    deps.err('Name a file: ragen kb rm <file-id>');
    return 1;
  }
  let failed = 0;
  for (const id of ids) {
    try {
      await outlastRateLimit(deps, id, () =>
        api(`files/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          notFound: `No file ${id} for this key.`,
        }),
      );
      deps.out(`Deleted ${id}`);
    } catch (error) {
      failed++;
      deps.err(error instanceof Error ? error.message : String(error));
      if (stopsTheBatch(error)) {
        const left = ids.length - ids.indexOf(id) - 1;
        if (left > 0) {
          deps.err(`Stopped: ${left} file(s) not deleted.`);
        }
        break;
      }
    }
  }
  return failed > 0 ? 1 : 0;
}

async function upload(deps: KbDeps, api: ApiClient, flags: Flags) {
  const paths = flags.positional;
  if (paths.length === 0) {
    deps.err('Name a file: ragen kb upload ./handbook.pdf');
    return 1;
  }
  const timeoutS = positiveInt(flags, '--timeout') ?? DEFAULT_TIMEOUT_S;
  const json = flags.switches.has('--json');

  const uploaded: ApiFile[] = [];
  let failed = 0;
  for (const path of paths) {
    let data: Uint8Array;
    try {
      data = await deps.readFile(path);
    } catch (error) {
      failed++;
      const code = (error as { code?: string }).code;
      deps.err(
        code === 'EISDIR'
          ? `${path} is a directory. Name its files instead, e.g. ${path}/*.pdf`
          : `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    try {
      const file = await uploadOne(deps, api, path, data);
      uploaded.push(file);
      if (!json) {
        deps.out(`Uploaded ${file.filename}  (${file.id})`);
      }
    } catch (error) {
      failed++;
      deps.err(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (stopsTheBatch(error)) {
        const left = paths.length - paths.indexOf(path) - 1;
        if (left > 0) {
          deps.err(`Stopped: ${left} file(s) not uploaded.`);
        }
        break;
      }
    }
  }

  let final = uploaded;
  if (flags.switches.has('--wait') && uploaded.length > 0) {
    const waited = await waitForIndex(deps, api, uploaded, timeoutS, json);
    final = waited.files;
    failed += waited.failed;
  }
  if (json) {
    deps.out(JSON.stringify(final, null, 2));
  }
  return failed > 0 ? 1 : 0;
}

function uploadOne(
  deps: KbDeps,
  api: ApiClient,
  path: string,
  data: Uint8Array,
): Promise<ApiFile> {
  return outlastRateLimit(deps, basename(path), () => {
    // A FormData is consumed by the request, so each attempt builds its own.
    const form = new FormData();
    form.append('file', new Blob([data]), basename(path));
    form.append('purpose', 'knowledge_base');
    return api<ApiFile>('files', { method: 'POST', body: form });
  });
}

/**
 * Every `/v1/files` route is throttled per minute, so a folder of documents
 * meets the limit by design — uploading or deleting. Waiting it out beats
 * failing the eleventh file; giving up after a few tries beats waiting
 * forever on a limit that is not lifting.
 */
async function outlastRateLimit<T>(
  deps: KbDeps,
  label: string,
  request: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      const seconds = waitableRetry(error);
      if (seconds !== undefined && attempt < RATE_LIMIT_ATTEMPTS) {
        deps.err(`Rate limited; waiting ${seconds}s before ${label}.`);
        await deps.sleep(seconds * 1000);
        continue;
      }
      throw error;
    }
  }
}

/**
 * How long to wait out a 429, or `undefined` when it is not one to wait out.
 * The per-minute throttlers always send a `Retry-After`; a 429 without one is
 * a usage ceiling that lifts next month, and retrying it only delays the
 * failure.
 */
function waitableRetry(error: unknown): number | undefined {
  if (
    !(error instanceof ApiError) ||
    error.status !== 429 ||
    error.retryAfter === undefined ||
    // Longer than any per-minute throttler asks for: not worth sitting out.
    error.retryAfter > MAX_RETRY_S
  ) {
    return undefined;
  }
  return error.retryAfter;
}

/**
 * An error that every later request in the batch would meet too: a refused
 * or disallowed key, or a limit still in force after the retries.
 */
function stopsTheBatch(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 429)
  );
}

/**
 * Polls until every file is `processed` or `error`, or the timeout passes.
 * A timeout is a failure: the caller asked to know the files were indexed,
 * and "still going" is not that. A 429 while waiting is waited out, not
 * reported: the files are still indexing.
 */
async function waitForIndex(
  deps: KbDeps,
  api: ApiClient,
  files: ApiFile[],
  timeoutS: number,
  json: boolean,
): Promise<{ files: ApiFile[]; failed: number }> {
  const deadline = deps.now() + timeoutS * 1000;
  const latest = new Map(files.map((f) => [f.id, f]));
  const pending = () =>
    [...latest.values()].filter((f) => f.status === 'uploaded');

  if (pending().length > 0 && !json) {
    deps.out(`Waiting for ${pending().length} file(s) to be indexed…`);
  }
  let delay = POLL_INTERVAL_MS;
  let stoppedBy: string | undefined;
  while (pending().length > 0 && deps.now() < deadline) {
    // The last round is cut short rather than skipped, so a timeout shorter
    // than the interval still asks once before giving up.
    await deps.sleep(Math.min(delay, deadline - deps.now()));
    delay = POLL_INTERVAL_MS;
    try {
      const fresh = await refresh(
        api,
        pending().map((f) => f.id),
      );
      for (const next of fresh.values()) {
        latest.set(next.id, next);
        if (!json && next.status !== 'uploaded') {
          deps.out(`${next.status.padEnd(9)} ${next.filename}`);
        }
      }
    } catch (error) {
      const seconds = waitableRetry(error);
      if (seconds !== undefined) {
        delay = seconds * 1000;
        continue;
      }
      // Anything else ends the wait, not the command: the uploads happened,
      // and a script still needs their ids and the statuses known so far.
      stoppedBy = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  const stillPending = pending();
  for (const file of stillPending) {
    deps.err(
      stoppedBy
        ? `${file.filename} was still being indexed when waiting stopped. Check later: ragen kb status ${file.id}`
        : `${file.filename} is still being indexed after ${timeoutS}s. Check later: ragen kb status ${file.id}`,
    );
  }
  if (stoppedBy) {
    deps.err(`Stopped waiting: ${stoppedBy}`);
  }
  const errored = [...latest.values()].filter((f) => f.status === 'error');
  for (const file of errored) {
    deps.err(
      `${file.filename} failed to index. The panel's document view says why.`,
    );
  }
  return {
    files: [...latest.values()],
    failed: stillPending.length + errored.length,
  };
}

function getFile(api: ApiClient, id: string): Promise<ApiFile> {
  return api<ApiFile>(`files/${encodeURIComponent(id)}`, {
    notFound: `No file ${id} for this key.`,
  });
}

function fileRow(file: ApiFile): string {
  // `sv-SE` is the locale that writes a date as YYYY-MM-DD, in local time —
  // an upload at 00:30 in Warsaw is today's, not yesterday's in UTC.
  const date = new Date(file.created_at * 1000).toLocaleDateString('sv-SE');
  return `${file.status.padEnd(9)} ${formatBytes(file.bytes).padStart(8)}  ${date}  ${file.filename}  (${file.id})`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
