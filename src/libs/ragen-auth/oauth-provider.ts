import type {
  OAuthClientProvider,
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientMetadata,
} from '@ai-sdk/mcp';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { ragenAuthClient, type StoreTokenData } from './client';

export type OAuthProviderOptions = {
  orgId: string;
  userId: string;
  provider: McpConnectorProvider;
  callbackUrl: string;
  fixedClientId?: string;
  fixedClientSecret?: string;
};

export class RagenAuthOAuthClientProvider implements OAuthClientProvider {
  private _authorizationUrl: URL | undefined;
  private orgId: string;
  private userId: string;
  private provider: McpConnectorProvider;
  private callbackUrl: string;
  private fixedClientId?: string;
  private fixedClientSecret?: string;

  constructor(opts: OAuthProviderOptions) {
    this.orgId = opts.orgId;
    this.userId = opts.userId;
    this.provider = opts.provider;
    this.callbackUrl = opts.callbackUrl;
    this.fixedClientId = opts.fixedClientId;
    this.fixedClientSecret = opts.fixedClientSecret;
  }

  private get customerId(): string {
    return `${this.orgId}:${this.userId}:${this.provider.toLowerCase()}`;
  }

  private get providerKey(): string {
    return this.provider;
  }

  get redirectUrl() {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.callbackUrl],
      client_name: 'Ragen',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
  }

  /**
   * After calling auth() in REDIRECT mode, this captures the authorization URL
   * so the API route can return it to the frontend.
   */
  get authorizationUrl(): URL | undefined {
    return this._authorizationUrl;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    try {
      const token = await ragenAuthClient.getToken(
        this.customerId,
        this.providerKey,
      );

      if (!token?.access_token || token.access_token === '__placeholder__') {
        return undefined;
      }

      let expiresIn: number | undefined;
      if (token.expires_at) {
        expiresIn = Math.max(
          0,
          Math.floor(
            (new Date(token.expires_at).getTime() - Date.now()) / 1000,
          ),
        );
      }

      return {
        access_token: token.access_token,
        token_type: token.token_type || 'Bearer',
        refresh_token: token.refresh_token || undefined,
        expires_in: expiresIn,
      };
    } catch (error) {
      logger.error(
        { err: error, customerId: this.customerId, provider: this.providerKey },
        'Failed to retrieve tokens from ragen-auth',
      );
      return undefined;
    }
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined;

    await ragenAuthClient.storeToken(this.customerId, this.providerKey, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      token_type: tokens.token_type || 'Bearer',
      expires_at: expiresAt,
    });
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    // If fixed credentials are provided (e.g. HubSpot pre-registered app), use them directly
    if (this.fixedClientId) {
      return {
        client_id: this.fixedClientId,
        client_secret: this.fixedClientSecret,
      };
    }

    // Otherwise check ragen-auth for dynamically registered client info
    try {
      const token = await ragenAuthClient.getToken(
        this.customerId,
        this.providerKey,
      );

      if (!token?.client_id) {
        return undefined;
      }

      return {
        client_id: token.client_id,
        client_secret: token.client_secret || undefined,
      };
    } catch (error) {
      logger.error(
        { err: error, customerId: this.customerId, provider: this.providerKey },
        'Failed to retrieve client information from ragen-auth',
      );
      return undefined;
    }
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    const existing = await this.getExistingTokenData();

    await ragenAuthClient.storeToken(this.customerId, this.providerKey, {
      ...existing,
      client_id: info.client_id,
      client_secret: info.client_secret || undefined,
    });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    this._authorizationUrl = url;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    const existing = await this.getExistingTokenData();

    await ragenAuthClient.storeToken(this.customerId, this.providerKey, {
      ...existing,
      code_verifier: verifier,
    });
  }

  /**
   * Fetch existing token data to preserve all fields during partial updates.
   * ragen-auth's PUT replaces the entire record, so we must merge.
   */
  private async getExistingTokenData(): Promise<StoreTokenData> {
    try {
      const token = await ragenAuthClient.getToken(
        this.customerId,
        this.providerKey,
      );
      return {
        access_token: token.access_token || '__placeholder__',
        refresh_token: token.refresh_token || undefined,
        client_id: token.client_id || undefined,
        client_secret: token.client_secret || undefined,
        code_verifier: token.code_verifier || undefined,
        token_type: token.token_type || undefined,
        expires_at: token.expires_at || undefined,
        scopes: token.scopes || undefined,
        token_uri: token.token_uri || undefined,
      };
    } catch {
      return { access_token: '__placeholder__' };
    }
  }

  async codeVerifier(): Promise<string> {
    try {
      const token = await ragenAuthClient.getToken(
        this.customerId,
        this.providerKey,
      );

      if (!token?.code_verifier) {
        throw new Error('No code verifier found');
      }

      return token.code_verifier;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'No code verifier found'
      ) {
        throw error;
      }
      logger.error(
        { err: error, customerId: this.customerId, provider: this.providerKey },
        'Failed to retrieve code verifier from ragen-auth',
      );
      throw new Error('No code verifier found');
    }
  }
}
