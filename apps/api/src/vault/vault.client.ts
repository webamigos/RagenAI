import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';

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
export class VaultClient implements OnModuleInit {
  private readonly logger = new Logger(VaultClient.name);
  private readonly timeoutMs = 5_000;

  private baseUrl: string;
  private secret: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.baseUrl = this.configService.getOrThrow<string>(
      'RAGEN_TOKEN_VAULT_URL',
    );
    this.secret = this.configService.getOrThrow<string>(
      'RAGEN_TOKEN_VAULT_SERVICE_SECRET',
    );
  }

  async storeToken(
    customerId: string,
    provider: string,
    token: StoreTokenInput,
  ): Promise<void> {
    const path = this.buildPath(customerId, provider);
    await this.request('PUT', path, token);
  }

  async retrieveToken(
    customerId: string,
    provider: string,
  ): Promise<VaultTokenData | null> {
    const path = this.buildPath(customerId, provider);
    try {
      return await this.request<VaultTokenData>('GET', path);
    } catch (err) {
      if (err instanceof VaultNotFoundError) return null;
      throw err;
    }
  }

  async deleteToken(customerId: string, provider: string): Promise<void> {
    const path = this.buildPath(customerId, provider);
    await this.request('DELETE', path);
  }

  private buildPath(customerId: string, provider: string): string {
    return `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}`;
  }

  private computeSignature(
    timestamp: string,
    method: string,
    path: string,
    body: string,
  ): string {
    const bodySha256 = createHash('sha256').update(body).digest('hex');
    const message = `${timestamp}\n${method}\n${path}\n${bodySha256}`;
    return createHmac('sha256', this.secret).update(message).digest('hex');
  }

  private async request<T = void>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const sig = this.computeSignature(timestamp, method, path, bodyStr);

    const headers: Record<string, string> = {
      Authorization: `HMAC-SHA256 ts=${timestamp},sig=${sig}`,
      'X-Service-Name': 'ragen-api',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
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
