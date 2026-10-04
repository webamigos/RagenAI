import type { Flags } from './flags';

/**
 * The one HTTP client every installation-facing command uses.
 *
 * Before this existed `ragen brain` built its own requests and `brain query`
 * carried a second copy of the status mapping; a third command would have
 * made three. The mapping is the part worth keeping in one place: a refused
 * key, a rate limit and a server error each need a sentence a person can act
 * on, and the server's own message — when it sent one — is appended rather
 * than thrown away.
 */

export interface Connection {
  /** The API's origin, without a trailing slash and without `/v1`. */
  url: string;
  key: string;
}

export const CONNECTION_HELP = [
  '  --url <api-url>       the Ragen API, e.g. https://api.example.com (or RAGEN_API_URL)',
  '  --api-key <key>       an API key (or RAGEN_API_KEY)',
].join('\n');

/**
 * Flags win over the environment. Returns `undefined` when either half is
 * missing, so each command can say what *it* needs the key for.
 */
export function resolveConnection(
  flags: Flags,
  env: Record<string, string | undefined>,
): Connection | undefined {
  const url = (flags.values.get('--url') ?? env.RAGEN_API_URL ?? '').replace(
    /\/+$/,
    '',
  );
  const key = flags.values.get('--api-key') ?? env.RAGEN_API_KEY ?? '';
  return url && key ? { url, key } : undefined;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds, from `Retry-After`, when the server sent one. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  /** A plain object is sent as JSON; `FormData` as multipart. */
  body?: Record<string, unknown> | FormData;
  /**
   * What a 404 means for this call. A 404 from `/v1/brain/*` means Brain is
   * off; from `/v1/files/:id` it means no such file — the generic sentence
   * would be wrong for both.
   */
  notFound?: string;
}

export type ApiClient = <T = unknown>(
  path: string,
  options?: RequestOptions,
) => Promise<T>;

/** The server's message, from either error shape apps/api produces. */
async function serverMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as {
      message?: unknown;
      error?: { message?: unknown } | string;
    };
    // Three shapes: OpenAI's `{ error: { message } }`, Nest's `{ message }`,
    // and `/v1/chat`'s limits, `{ error: 'Monthly usage limit exceeded' }` —
    // the one that tells "wait a minute" from "wait a month".
    let candidate: unknown = body.message;
    if (typeof body.error === 'string') {
      candidate = body.error;
    } else if (typeof body.error === 'object') {
      candidate = body.error?.message;
    }
    if (typeof candidate === 'string') {
      return candidate;
    }
    // class-validator answers with an array of messages.
    if (Array.isArray(candidate)) {
      return candidate.join('; ');
    }
  } catch {
    // No JSON body; the status alone has to do.
  }
  return undefined;
}

/**
 * The longest wait any throttler asked for. apps/api runs several named
 * throttlers, and @nestjs/throttler names the header after the one that
 * tripped — `Retry-After-expensive`, not `Retry-After` — so reading only the
 * standard name finds nothing.
 */
function retryAfterSeconds(res: Response): number | undefined {
  let longest: number | undefined;
  // `headers` is optional in practice: a test double rarely carries it.
  res.headers?.forEach?.((value, name) => {
    if (name === 'retry-after' || name.startsWith('retry-after-')) {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        longest = Math.max(longest ?? 0, seconds);
      }
    }
  });
  return longest;
}

export function createApiClient(
  fetchImpl: typeof fetch,
  connection: Connection,
): ApiClient {
  return async <T>(path: string, options: RequestOptions = {}) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') {
        params.set(name, String(value));
      }
    }
    const qs = params.toString();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${connection.key}`,
      Accept: 'application/json',
    };
    let body: string | FormData | undefined;
    if (options.body instanceof FormData) {
      // fetch sets the multipart boundary itself; setting Content-Type here
      // would drop it.
      body = options.body;
    } else if (options.body) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const res = await fetchImpl(
      `${connection.url}/v1/${path}${qs ? `?${qs}` : ''}`,
      { method: options.method ?? 'GET', headers, body },
    );

    if (res.ok) {
      return (await res.json()) as T;
    }

    const detail = await serverMessage(res);
    const withDetail = (sentence: string) =>
      detail && !sentence.includes(detail)
        ? `${sentence} (${detail})`
        : sentence;

    if (res.status === 401 || res.status === 403) {
      throw new ApiError(withDetail('The API key was refused.'), res.status);
    }
    if (res.status === 404) {
      throw new ApiError(
        options.notFound ?? withDetail('Not found.'),
        res.status,
      );
    }
    if (res.status === 429) {
      throw new ApiError(
        withDetail('Too many requests: the rate or usage limit was reached.'),
        res.status,
        retryAfterSeconds(res),
      );
    }
    throw new ApiError(
      withDetail(`The API answered ${res.status}.`),
      res.status,
    );
  };
}
