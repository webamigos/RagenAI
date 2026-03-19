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
  /** If true, rewrites the `scope` query param to `user_scope` in the authorization URL (required by Slack). */
  useUserScope?: boolean;
};

export class RagenAuthOAuthClientProvider implements OAuthClientProvider {
  private _authorizationUrl: URL | undefined;
  private orgId: string;
  private userId: string;
  private provider: McpConnectorProvider;
  private callbackUrl: string;
  private fixedClientId?: string;
  private fixedClientSecret?: string;
  private useUserScope: boolean;

  constructor(opts: OAuthProviderOptions) {
    this.orgId = opts.orgId;
    this.userId = opts.userId;
    this.provider = opts.provider;
    this.callbackUrl = opts.callbackUrl;
    this.fixedClientId = opts.fixedClientId;
    this.fixedClientSecret = opts.fixedClientSecret;
    this.useUserScope = opts.useUserScope ?? false;
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

      if (!token?.accessToken || token.accessToken === '__placeholder__') {
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
        access_token: token.accessToken,
        token_type: token.tokenType || 'Bearer',
        refresh_token: token.refreshToken || undefined,
        expires_in: expiresIn,
      };
    } catch (error) {
      logger.error(
        { err: error, customerId: this.customerId, provider: this.providerKey },
        'Failed to retrieve tokens from ragen-token-vault',
      );
      return undefined;
    }
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const existing = await this.getExistingTokenData();
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined;

    await ragenAuthClient.storeToken(this.customerId, this.providerKey, {
      ...existing,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      tokenType: tokens.token_type || 'Bearer',
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

    // Otherwise check ragen-token-vault for dynamically registered client info
    try {
      const token = await ragenAuthClient.getToken(
        this.customerId,
        this.providerKey,
      );

      if (!token?.clientId) {
        return undefined;
      }

      return {
        client_id: token.clientId,
        client_secret: token.clientSecret || undefined,
      };
    } catch (error) {
      logger.error(
        { err: error, customerId: this.customerId, provider: this.providerKey },
        'Failed to retrieve client information from ragen-token-vault',
      );
      return undefined;
    }
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    const existing = await this.getExistingTokenData();

    await ragenAuthClient.storeToken(this.customerId, this.providerKey, {
      ...existing,
      clientId: info.client_id,
      clientSecret: info.client_secret || undefined,
    });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    // Slack's OAuth v2 requires `user_scope` for user permissions — `scope` is for bot permissions.
    // Both params must be present; set `scope` to empty string so Slack doesn't try to install a bot.
    if (this.useUserScope) {
      const scope = url.searchParams.get('scope');
      if (scope) {
        url.searchParams.set('scope', '');
        url.searchParams.set('user_scope', scope);
      }
    }
    this._authorizationUrl = url;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    const existing = await this.getExistingTokenData();

    await ragenAuthClient.storeToken(this.customerId, this.providerKey, {
      ...existing,
      codeVerifier: verifier,
    });
  }

  /**
   * Fetch existing token data to preserve all fields during partial updates.
   * ragen-token-vault's PUT replaces the entire record, so we must merge.
   */
  private async getExistingTokenData(): Promise<StoreTokenData> {
    try {
      const token = await ragenAuthClient.getToken(
        this.customerId,
        this.providerKey,
      );
      return {
        accessToken: token.accessToken || '__placeholder__',
        refreshToken: token.refreshToken || undefined,
        clientId: token.clientId || undefined,
        clientSecret: token.clientSecret || undefined,
        codeVerifier: token.codeVerifier || undefined,
        tokenType: token.tokenType || undefined,
        expires_at: token.expires_at || undefined,
        scopes: token.scopes || undefined,
        token_uri: token.token_uri || undefined,
      };
    } catch (error) {
      logger.warn(
        { err: error, customerId: this.customerId, provider: this.providerKey },
        'Failed to fetch existing token data from ragen-token-vault, using placeholder',
      );
      return { accessToken: '__placeholder__' };
    }
  }

  async codeVerifier(): Promise<string> {
    try {
      const token = await ragenAuthClient.getToken(
        this.customerId,
        this.providerKey,
      );

      if (!token?.codeVerifier) {
        throw new Error('No code verifier found');
      }

      return token.codeVerifier;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'No code verifier found'
      ) {
        throw error;
      }
      logger.error(
        { err: error, customerId: this.customerId, provider: this.providerKey },
        'Failed to retrieve code verifier from ragen-token-vault',
      );
      throw new Error('No code verifier found');
    }
  }
}
