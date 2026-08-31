import { Logger } from '@nestjs/common';
import crypto from 'node:crypto';

/**
 * Ported from ragen-app's src/libs/ragen-vault/client.ts — HMAC-SHA256-
 * signed HTTP client to the external ragen-token-vault service (OAuth
 * token storage for MCP connectors). No Next.js coupling in the original;
 * only the logger swap applies here. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * NOTE: this is a *different* vault namespace/purpose than
 * apps/api/src/vault/vault.client.ts (API-key secret validation) — do not
 * merge the two even though both talk to ragen-token-vault.
 */

const REQUEST_TIMEOUT_MS = 10_000;
// Identifies this caller to ragen-token-vault for logging/auditing (not
// part of the HMAC signature). apps/api is a distinct caller from
// ragen-app, so it gets its own name here rather than reusing 'ragen-app'.
const SERVICE_NAME = 'ragen-api';

const logger = new Logger('RagenAuthClient');

export type StoreTokenData = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  codeVerifier?: string;
  tokenType?: string;
  expires_at?: string;
  scopes?: string[];
  token_uri?: string;
};

export type TokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  codeVerifier: string | null;
  tokenType: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  token_uri: string | null;
};

export type TokenStatusResponse = {
  provider: string;
  tokenType: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  is_expired: boolean;
  createdAt: string;
  updatedAt: string;
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
          `ragen-token-vault ${method} ${path} returned ${response.status}: ${errorBody}`,
        );
      }

      // DELETE returns 204 with no body
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`ragen-token-vault ${method} ${path} timed out`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private tokenPath(customerId: string, provider: string): string {
    return `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}`;
  }

  async storeToken(
    customerId: string,
    provider: string,
    data: StoreTokenData,
  ): Promise<void> {
    // Convert to snake_case for the vault API
    const payload: Record<string, unknown> = {
      access_token: data.accessToken,
    };
    if (data.refreshToken) {
      payload.refresh_token = data.refreshToken;
    }
    if (data.clientId) {
      payload.client_id = data.clientId;
    }
    if (data.clientSecret) {
      payload.client_secret = data.clientSecret;
    }
    if (data.codeVerifier) {
      payload.code_verifier = data.codeVerifier;
    }
    if (data.tokenType) {
      payload.token_type = data.tokenType;
    }
    if (data.expires_at) {
      payload.expires_at = data.expires_at;
    }
    if (data.scopes) {
      payload.scopes = data.scopes;
    }
    if (data.token_uri) {
      payload.token_uri = data.token_uri;
    }

    await this.request<void>(
      'PUT',
      this.tokenPath(customerId, provider),
      payload,
    );
    logger.log(`Stored token in ragen-token-vault (provider=${provider})`);
  }

  async getToken(customerId: string, provider: string): Promise<TokenResponse> {
    // Vault returns snake_case, convert to camelCase
    const raw = await this.request<Record<string, unknown>>(
      'GET',
      this.tokenPath(customerId, provider),
    );
    const accessToken =
      (raw.access_token as string) ?? (raw.accessToken as string);
    if (!accessToken) {
      throw new Error(
        `Token response missing access_token for provider ${provider}`,
      );
    }
    return {
      accessToken,
      refreshToken:
        (raw.refresh_token as string | null) ??
        (raw.refreshToken as string | null) ??
        null,
      clientId:
        (raw.client_id as string | null) ??
        (raw.clientId as string | null) ??
        null,
      clientSecret:
        (raw.client_secret as string | null) ??
        (raw.clientSecret as string | null) ??
        null,
      codeVerifier:
        (raw.code_verifier as string | null) ??
        (raw.codeVerifier as string | null) ??
        null,
      tokenType:
        (raw.token_type as string | null) ??
        (raw.tokenType as string | null) ??
        null,
      expires_at: (raw.expires_at as string | null) ?? null,
      scopes: (raw.scopes as string[] | null) ?? null,
      token_uri:
        (raw.token_uri as string | null) ??
        (raw.tokenUri as string | null) ??
        null,
    };
  }

  async deleteToken(customerId: string, provider: string): Promise<void> {
    await this.request<void>('DELETE', this.tokenPath(customerId, provider));
    logger.log(`Deleted token from ragen-token-vault (provider=${provider})`);
  }

  async getTokenStatus(
    customerId: string,
    provider: string,
  ): Promise<TokenStatusResponse> {
    return this.request<TokenStatusResponse>(
      'GET',
      `${this.tokenPath(customerId, provider)}/status`,
    );
  }

  async listTokens(customerId: string): Promise<ListTokensResponse> {
    const path = `/v1/tokens/${encodeURIComponent(customerId)}`;
    return this.request<ListTokensResponse>('GET', path);
  }
}

let _ragenAuthClient: RagenAuthClient | null = null;

export function getRagenAuthClient(): RagenAuthClient {
  if (!_ragenAuthClient) {
    const baseUrl =
      process.env.RAGEN_TOKEN_VAULT_URL ?? process.env.RAGEN_VAULT_URL;
    const secret =
      process.env.RAGEN_TOKEN_VAULT_SERVICE_SECRET ??
      process.env.RAGEN_VAULT_SERVICE_SECRET;

    if (!baseUrl || !secret) {
      throw new Error(
        'RAGEN_TOKEN_VAULT_URL and RAGEN_TOKEN_VAULT_SERVICE_SECRET must be set',
      );
    }

    _ragenAuthClient = new RagenAuthClient(baseUrl, secret);
  }
  return _ragenAuthClient;
}

/**
 * Lazy-initialized singleton. Access via property getter to avoid
 * crashing at import time when env vars are not yet available.
 */
export const ragenAuthClient = new Proxy({} as RagenAuthClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getRagenAuthClient(), prop, receiver);
  },
});
