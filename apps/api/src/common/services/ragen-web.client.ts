import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ApiContext } from '../types/api-context.js';

export type RagenWebRequest = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  context: ApiContext;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /**
   * When true, body is passed through untouched (used for multipart form
   * uploads where the caller has already constructed a FormData / stream).
   * When false/undefined, body is JSON.stringify'd and Content-Type is
   * set to application/json.
   */
  rawBody?: boolean;
  /** Extra headers to merge in. Internal-auth headers always win. */
  headers?: Record<string, string>;
};

/**
 * Centralized HTTP client for calling apps/web's internal `/api/v1/*`
 * endpoints from apps/api. Injects the shared-secret auth headers
 * (`x-internal-secret`, `x-org-id`, `x-user-id`, `x-project-id`) derived
 * from the caller's `ApiContext`.
 *
 * Callers that need to pipe a streaming response to the HTTP client use
 * `request()` and handle the raw `Response` themselves. Callers that
 * want the parsed JSON body use `requestJson()`.
 */
@Injectable()
export class RagenWebClient {
  private readonly logger = new Logger(RagenWebClient.name);

  constructor(private readonly configService: ConfigService) {}

  /** Perform the request and return the raw `Response`. */
  async request(options: RagenWebRequest): Promise<Response> {
    const baseUrl = this.configService.getOrThrow<string>(
      'RAGEN_APP_INTERNAL_URL',
    );
    const internalSecret = this.configService.getOrThrow<string>(
      'INTERNAL_API_SECRET',
    );

    const url = new URL(options.path, baseUrl);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v === undefined) {
          continue;
        }
        url.searchParams.set(k, String(v));
      }
    }

    // Spread caller headers first, then overwrite with internal headers
    // so callers cannot forge auth or debug-mode values.
    const headers: Record<string, string> = {
      ...options.headers,
      'x-internal-secret': internalSecret,
      'x-org-id': options.context.orgId,
      'x-user-id': options.context.userId,
    };
    // Skip `x-project-id` when the context doesn't carry one (org-scoped
    // API keys). Sending the literal string "undefined" would make
    // apps/web look up a project with that id and 404.
    if (options.context.projectId !== undefined) {
      headers['x-project-id'] = options.context.projectId;
    }
    // Debug mode is strictly derived from the API key's DB flag — callers
    // cannot force it via options.headers.
    if (options.context.debugMode) {
      headers['x-debug-mode'] = '1';
    } else {
      delete headers['x-debug-mode'];
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.rawBody) {
        body = options.body as BodyInit;
      } else {
        headers['Content-Type'] ??= 'application/json';
        body = JSON.stringify(options.body);
      }
    }

    try {
      return await fetch(url.toString(), {
        method: options.method,
        headers,
        body,
        signal: options.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to reach apps/web (${options.path}): ${message}`,
      );
      throw new Error('Upstream service unavailable');
    }
  }

  /**
   * Perform the request and parse the JSON body. Throws on non-2xx
   * responses with the upstream status and body preserved on the error.
   */
  async requestJson<T>(options: RagenWebRequest): Promise<T> {
    const response = await this.request(options);
    const text = await response.text();
    if (!response.ok) {
      this.logger.warn(
        `apps/web returned ${response.status} for ${options.path}`,
      );
      throw new RagenWebError(response.status, text);
    }
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }
}

/**
 * Thrown when apps/web returns a non-2xx status. Exposes the upstream
 * status and raw body so callers can decide how to surface it (e.g.
 * translate to an OpenAI-style error response).
 */
export class RagenWebError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`apps/web request failed: ${status}`);
    this.name = 'RagenWebError';
  }
}
