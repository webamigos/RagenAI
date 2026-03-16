import type {
  OAuthClientProvider,
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientMetadata,
} from '@ai-sdk/mcp';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';

export type OAuthProviderOptions = {
  orgId: string;
  userId: string;
  provider: McpConnectorProvider;
  callbackUrl: string;
  fixedClientId?: string;
  fixedClientSecret?: string;
};

export class PrismaOAuthClientProvider implements OAuthClientProvider {
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
    const record = await db.mcpOAuthToken.findUnique({
      where: {
        organizationId_userId_provider: {
          organizationId: this.orgId,
          userId: this.userId,
          provider: this.provider,
        },
      },
    });

    if (!record?.accessToken) {
      return undefined;
    }

    return {
      access_token: record.accessToken,
      token_type: record.tokenType,
      refresh_token: record.refreshToken || undefined,
      expires_in: record.expiresAt
        ? Math.max(
            0,
            Math.floor((record.expiresAt.getTime() - Date.now()) / 1000),
          )
        : undefined,
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await db.mcpOAuthToken.upsert({
      where: {
        organizationId_userId_provider: {
          organizationId: this.orgId,
          userId: this.userId,
          provider: this.provider,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        tokenType: tokens.token_type || 'Bearer',
      },
      create: {
        organizationId: this.orgId,
        userId: this.userId,
        provider: this.provider,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        tokenType: tokens.token_type || 'Bearer',
      },
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

    // Otherwise check DB for dynamically registered client info
    const record = await db.mcpOAuthToken.findUnique({
      where: {
        organizationId_userId_provider: {
          organizationId: this.orgId,
          userId: this.userId,
          provider: this.provider,
        },
      },
    });

    if (!record?.clientId) {
      return undefined;
    }

    return {
      client_id: record.clientId,
      client_secret: record.clientSecret || undefined,
    };
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    await db.mcpOAuthToken.upsert({
      where: {
        organizationId_userId_provider: {
          organizationId: this.orgId,
          userId: this.userId,
          provider: this.provider,
        },
      },
      update: {
        clientId: info.client_id,
        clientSecret: info.client_secret || null,
      },
      create: {
        organizationId: this.orgId,
        userId: this.userId,
        provider: this.provider,
        accessToken: '',
        clientId: info.client_id,
        clientSecret: info.client_secret || null,
      },
    });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    this._authorizationUrl = url;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await db.mcpOAuthToken.upsert({
      where: {
        organizationId_userId_provider: {
          organizationId: this.orgId,
          userId: this.userId,
          provider: this.provider,
        },
      },
      update: {
        codeVerifier: verifier,
      },
      create: {
        organizationId: this.orgId,
        userId: this.userId,
        provider: this.provider,
        accessToken: '',
        codeVerifier: verifier,
      },
    });
  }

  async codeVerifier(): Promise<string> {
    const record = await db.mcpOAuthToken.findUnique({
      where: {
        organizationId_userId_provider: {
          organizationId: this.orgId,
          userId: this.userId,
          provider: this.provider,
        },
      },
    });

    if (!record?.codeVerifier) {
      throw new Error('No code verifier found');
    }

    return record.codeVerifier;
  }
}
