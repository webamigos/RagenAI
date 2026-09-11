import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  signVaultRequest,
  vaultAuthorizationHeader,
} from '@ragenai/vault-client';
import { withSpan } from '../telemetry/telemetry.js';

export interface VaultTokenData {
  access_token: string;
  refresh_token?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  code_verifier?: string | null;
  token_type?: string;
  expires_at?: Date | null;
  scopes?: string | null;
  token_uri?: string | null;
}

export interface StoreTokenInput {
  access_token: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  token_type?: string;
  expires_at?: string;
  scopes?: string;
  token_uri?: string;
}

@Injectable()
export class VaultClient {
  private readonly logger = new Logger(VaultClient.name);
  private readonly timeoutMs = 5_000;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Reads the vault's address and signing secret at call time, not at boot.
   *
   * `src/config/env.ts` declares this pair `allOrNone`, and
   * `packages/env`'s fragment marks it `.optional()` — an installation that
   * runs no token vault is a supported configuration (ADR-32: the vault is a
   * separate service, and connectors are the only thing that needs it). This
   * used to resolve in `onModuleInit` with `getOrThrow`, which contradicted
   * that: the whole API refused to start, so every self-hosted install lost
   * chat, threads and notifications over a service it was not using. A fresh
   * `npx create-ragen-app` hit it every time.
   *
   * Failing here instead means the only thing that breaks is the connector
   * call that actually needed the vault, and it says exactly what to set.
   */
  private credentials(): { baseUrl: string; secret: string } {
    const baseUrl = this.configService.get<string>('RAGEN_TOKEN_VAULT_URL');
    const secret = this.configService.get<string>(
      'RAGEN_TOKEN_VAULT_SERVICE_SECRET',
    );

    if (!baseUrl || !secret) {
      throw new VaultNotConfiguredError();
    }

    return { baseUrl, secret };
  }

  /** Whether this installation has a token vault at all. */
  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('RAGEN_TOKEN_VAULT_URL') &&
      this.configService.get<string>('RAGEN_TOKEN_VAULT_SERVICE_SECRET'),
    );
  }

  // Spans wrap the public methods rather than the private request() below:
  // a 404 from the vault means "no token stored", which retrieveToken treats
  // as a normal result. Tracing at this level keeps that case an OK span
  // instead of recording an exception on every user without a connector.
  // customerId is deliberately left off the attributes — it embeds org/user
  // IDs and the provider is enough to make a span readable.
  async storeToken(
    customerId: string,
    provider: string,
    token: StoreTokenInput,
  ): Promise<void> {
    const path = this.buildPath(customerId, provider);
    await withSpan(
      'vault.storeToken',
      { 'vault.provider': provider },
      async () => this.request('PUT', path, token),
    );
  }

  async retrieveToken(
    customerId: string,
    provider: string,
  ): Promise<VaultTokenData | null> {
    const path = this.buildPath(customerId, provider);
    return withSpan(
      'vault.retrieveToken',
      { 'vault.provider': provider },
      async () => {
        try {
          return await this.request<VaultTokenData>('GET', path);
        } catch (err) {
          if (err instanceof VaultNotFoundError) return null;
          throw err;
        }
      },
    );
  }

  async deleteToken(customerId: string, provider: string): Promise<void> {
    const path = this.buildPath(customerId, provider);
    await withSpan(
      'vault.deleteToken',
      { 'vault.provider': provider },
      async () => this.request('DELETE', path),
    );
  }

  private buildPath(customerId: string, provider: string): string {
    return `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}`;
  }

  private async request<T = void>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const { baseUrl, secret } = this.credentials();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const sig = signVaultRequest({
      secret,
      timestamp,
      method,
      path,
      body: bodyStr,
    });

    const headers: Record<string, string> = {
      Authorization: vaultAuthorizationHeader(timestamp, sig),
      'X-Service-Name': 'ragen-api',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
      ...(body ? { body: bodyStr } : {}),
    });

    if (response.status === 404) {
      throw new VaultNotFoundError(path);
    }

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `Vault ${method} ${path} failed (${response.status}): ${text}`,
      );
      throw new Error(`Vault request failed (${response.status}): ${text}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return (await response.json()) as T;
    }

    return undefined as T;
  }
}

export class VaultNotFoundError extends Error {
  override readonly name = 'VaultNotFoundError';

  constructor(path: string) {
    super(`Vault resource not found: ${path}`);
  }
}

export class VaultNotConfiguredError extends Error {
  override readonly name = 'VaultNotConfiguredError';

  constructor() {
    super(
      'The token vault is not configured. Set RAGEN_TOKEN_VAULT_URL and ' +
        'RAGEN_TOKEN_VAULT_SERVICE_SECRET to use connectors; see ' +
        'docs/token-vault.md.',
    );
  }
}
