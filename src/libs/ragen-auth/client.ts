import crypto from 'node:crypto';
import { logger } from '@/app/lib/utils/logger';

const REQUEST_TIMEOUT_MS = 10_000;
const SERVICE_NAME = 'ragen-app';

export type StoreTokenData = {
  access_token: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  token_type?: string;
  expires_at?: string;
  scopes?: string[];
  token_uri?: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string | null;
  client_id: string | null;
  client_secret: string | null;
  code_verifier: string | null;
  token_type: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  token_uri: string | null;
};

export type TokenStatusResponse = {
  provider: string;
  token_type: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  is_expired: boolean;
  created_at: string;
  updated_at: string;
};

export type ListTokensResponse = {
  tokens: TokenStatusResponse[];
};

function computeHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  path: string,
  body: string,
): string {
  const bodySha256 = crypto.createHash('sha256').update(body).digest('hex');
  const message = `${timestamp}\n${method}\n${path}\n${bodySha256}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export class RagenAuthClient {
  private baseUrl: string;
  private secret: string;

  constructor(baseUrl: string, secret: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secret = secret;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const bodyStr = body ? JSON.stringify(body) : '';
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = computeHmacSignature(
      this.secret,
      timestamp,
      method,
      path,
      bodyStr,
    );

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `HMAC-SHA256 ts=${timestamp},sig=${sig}`,
      'X-Service-Name': SERVICE_NAME,
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        throw new Error(
          `ragen-auth ${method} ${path} returned ${response.status}: ${errorBody}`,
        );
      }

      // DELETE returns 204 with no body
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`ragen-auth ${method} ${path} timed out`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async storeToken(
    customerId: string,
    provider: string,
    data: StoreTokenData,
  ): Promise<void> {
    const path = `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}`;
    await this.request<void>('PUT', path, data);
    logger.info({ provider }, 'Stored token in ragen-auth');
  }

  async getToken(customerId: string, provider: string): Promise<TokenResponse> {
    const path = `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}`;
    return this.request<TokenResponse>('GET', path);
  }

  async deleteToken(customerId: string, provider: string): Promise<void> {
    const path = `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}`;
    await this.request<void>('DELETE', path);
    logger.info({ provider }, 'Deleted token from ragen-auth');
  }

  async getTokenStatus(
    customerId: string,
    provider: string,
  ): Promise<TokenStatusResponse> {
    const path = `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}/status`;
    return this.request<TokenStatusResponse>('GET', path);
  }

  async listTokens(customerId: string): Promise<ListTokensResponse> {
    const path = `/v1/tokens/${encodeURIComponent(customerId)}`;
    return this.request<ListTokensResponse>('GET', path);
  }
}

function createRagenAuthClient(): RagenAuthClient {
  const baseUrl = process.env.RAGEN_AUTH_URL;
  const secret = process.env.RAGEN_AUTH_SERVICE_SECRET;

  if (!baseUrl || !secret) {
    throw new Error('RAGEN_AUTH_URL and RAGEN_AUTH_SERVICE_SECRET must be set');
  }

  return new RagenAuthClient(baseUrl, secret);
}

export const ragenAuthClient = createRagenAuthClient();
