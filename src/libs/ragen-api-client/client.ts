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
 * Extracts the human-readable message from a `RagenApiError`'s JSON
 * body — apps/api's exception filters (`ApiExceptionFilter`,
 * `OpenAiExceptionFilter`) both put it under `.message` (Nest's default
 * `HttpException` shape) or `.error.message` (the OpenAI-envelope
 * shape). Falls back to `fallback` for any other error type, a
 * non-JSON body, or a missing message field — use this wherever a
 * ported command used to throw/return a specific business message (an
 * "upgrade your plan" message, a validation error, ...) that the UI
 * actually displays, so cutting the call over to apps/api doesn't
 * degrade it to a generic HTTP-status message.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof RagenApiError)) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(error.body);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.message === 'string') {
        return obj.message;
      }
      if (
        obj.error &&
        typeof obj.error === 'object' &&
        typeof (obj.error as Record<string, unknown>).message === 'string'
      ) {
        return (obj.error as Record<string, unknown>).message as string;
      }
    }
  } catch {
    // Non-JSON body — fall through to the fallback.
  }
  return fallback;
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
