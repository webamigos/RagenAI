import { signVaultRequest, vaultAuthorizationHeader } from './signing';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Minimal logging surface, so the caller can pass whatever it already has —
 * apps/web has a pino logger whose first argument is a metadata object, and
 * apps/api has a NestJS Logger. Neither is a dependency of this package.
 */
export type VaultClientLogger = {
  info: (meta: Record<string, unknown>, message: string) => void;
};

const SILENT_LOGGER: VaultClientLogger = { info: () => {} };

export type VaultClientOptions = {
  baseUrl: string;
  secret: string;
  /**
   * Sent as `X-Service-Name` for the vault's own auditing. Not part of the
   * signature — apps/web and apps/api are distinct callers and say so.
   */
  serviceName: string;
  logger?: VaultClientLogger;
};

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

export class RagenAuthClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly serviceName: string;
  private readonly logger: VaultClientLogger;

  constructor({ baseUrl, secret, serviceName, logger }: VaultClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secret = secret;
    this.serviceName = serviceName;
    this.logger = logger ?? SILENT_LOGGER;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const bodyStr = body ? JSON.stringify(body) : '';
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = signVaultRequest({
      secret: this.secret,
      timestamp,
      method,
      path,
      body: bodyStr,
    });

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: vaultAuthorizationHeader(timestamp, sig),
      'X-Service-Name': this.serviceName,
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
    this.logger.info({ provider }, 'Stored token in ragen-token-vault');
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
    this.logger.info({ provider }, 'Deleted token from ragen-token-vault');
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
