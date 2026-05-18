import { createHmac } from 'node:crypto';
import { logger } from '@/app/lib/utils/logger';

const REQUEST_TIMEOUT_MS = 30_000;

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

  // Callers are expected to handle retry/backoff on `code: 'upstream'`
  // (e.g. via Temporal activity retries). This client makes a single attempt.
  async enrichCompany(input: EnrichRequest): Promise<EnrichResponse> {
    const path = '/enrich/company';
    const bodyStr = JSON.stringify(input);
    // ms-epoch; the server enforces a 5-minute skew window via
    // `enrichAuthMiddleware` in ragen-mcp/services/rejestrio/src/http/auth.ts.
    const timestamp = String(Date.now());
    const signature = signRequest(this.secret, timestamp, 'POST', path, bodyStr);

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
      });

      if (response.status === 404) {
        return { success: false, error: 'not_found', code: 'not_found' };
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
        const text = await response.text().catch(() => '');
        logger.error(
          { status: response.status, body: text.slice(0, 200) },
          'rejestrio enrich call failed',
        );
        return { success: false, error: `upstream_${response.status}`, code: 'upstream' };
      }

      return (await response.json()) as EnrichResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn({ input: { customerId: input.customerId } }, 'rejestrio enrich timed out');
        return { success: false, error: 'timeout', code: 'upstream' };
      }
      logger.error({ err: error }, 'rejestrio enrich unexpected error');
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
