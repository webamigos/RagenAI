import { createHmac } from 'node:crypto';
import { logger } from '@/app/lib/utils/logger';

// rejestrio's full enrichment flow includes upstream rejestr.io calls and a
// financial-documents fetch after the basic snapshot is written; the full
// response can take >30s in the wild. The ms-epoch HMAC window on the server
// is 5 minutes, so we have plenty of headroom below that.
const REQUEST_TIMEOUT_MS = 120_000;
// One transparent retry when the call fails with an `upstream` error code
// (timeout, network error, or non-2xx). rejestrio's writes are idempotent —
// re-running an enrichment overwrites the snapshot — so the worst case of a
// duplicated successful call is some wasted work, not data corruption.
const UPSTREAM_RETRY_ATTEMPTS = 1;

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}

export type EnrichmentPayload = {
  krs: string;
  nip: string | null;
  regon: string | null;
  nazwaPelna: string;
  nazwaSkrocona: string | null;
  formaPrawna: string | null;
  pkdGlowny: string | null;
  miejscowosc: string | null;
  kodPocztowy: string | null;
  wykreslona: boolean;
  wUpadlosci: boolean;
  wLikwidacji: boolean;
  przychodyPln: number | null;
  zyskPln: number | null;
  aktywaPln: number | null;
  sprawozdanieRocznik: number | null;
};

export type EnrichRequest = {
  customerId: string;
  nip?: string;
  krs?: string | number;
  name?: string;
  includeFinancials?: boolean;
};

export type EnrichSuccess = {
  success: true;
  matched: { source: 'krs' | 'nip' | 'name'; via?: string };
  data: EnrichmentPayload;
};

export type EnrichFailure = {
  success: false;
  error: string;
  code: 'not_found' | 'ambiguous' | 'upstream' | 'invalid';
};

export type EnrichResponse = EnrichSuccess | EnrichFailure;

function signRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  const message = `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
  return createHmac('sha256', secret).update(message).digest('hex');
}

export class RejestrioHttpClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(baseUrl: string, secret: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secret = secret;
  }

  // Public entry point — transparently retries on `code: 'upstream'`
  // (timeouts, network errors, non-2xx responses). rejestrio is idempotent
  // for repeat enrichments so retries don't corrupt anything; the worst
  // case is duplicated upstream work for a single user click.
  async enrichCompany(input: EnrichRequest): Promise<EnrichResponse> {
    let lastResponse: EnrichResponse | null = null;
    for (let attempt = 0; attempt <= UPSTREAM_RETRY_ATTEMPTS; attempt++) {
      const response = await this.attemptEnrichCompany(input, attempt);
      if (response.success || response.code !== 'upstream') {
        return response;
      }
      lastResponse = response;
    }
    return lastResponse!;
  }

  private async attemptEnrichCompany(
    input: EnrichRequest,
    attempt: number,
  ): Promise<EnrichResponse> {
    const path = '/enrich/company';
    const bodyStr = JSON.stringify(input);
    // ms-epoch; the server enforces a 5-minute skew window via
    // `enrichAuthMiddleware` in ragen-mcp/services/rejestrio/src/http/auth.ts.
    const timestamp = String(Date.now());
    const signature = signRequest(
      this.secret,
      timestamp,
      'POST',
      path,
      bodyStr,
    );

    // Compact request-context for logs — never include the full body or
    // secret. nip/krs identify the lookup; customerId is org:user (safe).
    const requestCtx = {
      host: safeHost(this.baseUrl),
      customerId: input.customerId,
      nip: input.nip,
      krs: input.krs,
      hasName: Boolean(input.name),
      bodyBytes: bodyStr.length,
      attempt,
    };
    const startedAt = Date.now();
    logger.info(requestCtx, 'rejestrio enrich → request');

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-timestamp': timestamp,
          'x-signature': signature,
        },
        body: bodyStr,
        signal: controller.signal,
        // Belt-and-suspenders: POST is not cached by Next.js by default,
        // but be explicit so this never gets cached if invoked from a
        // route group that opts in elsewhere.
        cache: 'no-store',
      });
      logger.info(
        {
          ...requestCtx,
          status: response.status,
          durationMs: Date.now() - startedAt,
        },
        'rejestrio enrich → response',
      );

      if (response.status === 404) {
        const body = (await response
          .json()
          .catch(() => null)) as EnrichFailure | null;
        return {
          success: false,
          error: body?.error ?? 'not_found',
          code: 'not_found',
        };
      }
      if (response.status === 400) {
        const text = await response.text().catch(() => '');
        return {
          success: false,
          error: (text || 'invalid_request').slice(0, 200),
          code: 'invalid',
        };
      }
      if (!response.ok) {
        const json = (await response
          .json()
          .catch(() => null)) as EnrichFailure | null;
        if (json && json.error) {
          logger.error(
            { status: response.status, body: json.error.slice(0, 200) },
            'rejestrio enrich call failed',
          );
          return {
            success: false,
            error: json.error,
            code: json.code ?? 'upstream',
          };
        }
        const text = await response.text().catch(() => '');
        logger.error(
          { status: response.status, body: text.slice(0, 200) },
          'rejestrio enrich call failed',
        );
        return {
          success: false,
          error: text.slice(0, 200) || `upstream_${response.status}`,
          code: 'upstream',
        };
      }

      return (await response.json()) as EnrichResponse;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn(
          { ...requestCtx, durationMs },
          'rejestrio enrich timed out',
        );
        return { success: false, error: 'timeout', code: 'upstream' };
      }
      logger.error(
        { err: error, ...requestCtx, durationMs },
        'rejestrio enrich unexpected error',
      );
      return { success: false, error: 'network_error', code: 'upstream' };
    } finally {
      clearTimeout(timeout);
    }
  }
}

let _client: RejestrioHttpClient | null = null;

export function getRejestrioHttpClient(): RejestrioHttpClient {
  if (!_client) {
    const baseUrl = process.env.REJESTRIO_SERVICE_URL;
    const secret = process.env.REJESTRIO_ENRICH_SECRET;
    if (!baseUrl || !secret) {
      throw new Error(
        'REJESTRIO_SERVICE_URL and REJESTRIO_ENRICH_SECRET must be set',
      );
    }
    _client = new RejestrioHttpClient(baseUrl, secret);
  }
  return _client;
}

export const rejestrioHttpClient = new Proxy({} as RejestrioHttpClient, {
  get(_t, prop, receiver) {
    return Reflect.get(getRejestrioHttpClient(), prop, receiver);
  },
});

export const __testing = { signRequest };
