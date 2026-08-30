import { logger } from '@/app/lib/utils/logger';
import { issueSessionToken } from '@/libs/service-auth/issue-session-token';

const REQUEST_TIMEOUT_MS = 10_000;

export type RagenApiRequestParams = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path under apps/api's `internal/*` prefix, e.g. `/v1/internal/notifications`. */
  path: string;
  userId: string;
  orgId: string;
  projectId?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

/**
 * Thrown when apps/api returns a non-2xx status. Exposes the upstream
 * status and raw body so callers can decide how to surface it.
 */
export class RagenApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`apps/api request failed: ${status}`);
    this.name = 'RagenApiError';
  }
}

/**
 * Calls ragen-api's session-authenticated `internal/*` routes on behalf
 * of the current, already Better-Auth-authenticated request. Mints a
 * short-lived signed token via `issueSessionToken()` (see
 * docs/adrs/21-monorepo-and-api-decoupling.md, Phase A) — never call
 * this from client code, server-to-server only.
 *
 * Mirrors apps/api's own reverse-direction client
 * (`common/services/ragen-app.client.ts`) in shape.
 */
export async function ragenApiRequest<T>(
  params: RagenApiRequestParams,
): Promise<T> {
  const baseUrl = process.env.RAGEN_API_INTERNAL_URL;
  if (!baseUrl) {
    throw new Error('Missing RAGEN_API_INTERNAL_URL environment variable');
  }

  const token = issueSessionToken({
    userId: params.userId,
    orgId: params.orgId,
    projectId: params.projectId,
  });

  const url = new URL(params.path, baseUrl);
  if (params.query) {
    for (const [key, value] of Object.entries(params.query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let body: string | undefined;
  if (params.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(params.body);
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  );
  const signal = params.signal
    ? AbortSignal.any([params.signal, timeoutController.signal])
    : timeoutController.signal;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: params.method,
      headers,
      body,
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, path: params.path }, 'Failed to reach apps/api');
    throw new Error(`Upstream service unavailable: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  if (!response.ok) {
    logger.warn(
      { status: response.status, path: params.path },
      'apps/api returned a non-2xx status',
    );
    throw new RagenApiError(response.status, text);
  }
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
