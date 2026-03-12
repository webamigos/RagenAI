import type {
  OAuthClientProvider,
  OAuthTokens,
  OAuthClientInformation,
  OAuthClientMetadata,
} from '@ai-sdk/mcp';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { encryptApiKey, decryptApiKey } from '@/app/lib/utils/hashApiKey';

export class PrismaOAuthClientProvider implements OAuthClientProvider {
  private _authorizationUrl: URL | undefined;

  constructor(
    private orgId: string,
    private userId: string,
    private provider: McpConnectorProvider,
    private callbackUrl: string,
  ) {}

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
        organization_id_user_id_provider: {
          organization_id: this.orgId,
          user_id: this.userId,
          provider: this.provider,
        },
      },
    });

    if (!record?.access_token) {
      return undefined;
    }

    return {
      access_token: decryptApiKey(record.access_token),
      token_type: record.token_type,
      refresh_token: record.refresh_token
        ? decryptApiKey(record.refresh_token)
        : undefined,
      expires_in: record.expires_at
        ? Math.max(
            0,
            Math.floor((record.expires_at.getTime() - Date.now()) / 1000),
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
        organization_id_user_id_provider: {
          organization_id: this.orgId,
          user_id: this.userId,
          provider: this.provider,
        },
      },
      update: {
        access_token: encryptApiKey(tokens.access_token),
        refresh_token: tokens.refresh_token
          ? encryptApiKey(tokens.refresh_token)
          : null,
        expires_at: expiresAt,
        token_type: tokens.token_type || 'Bearer',
      },
      create: {
        organization_id: this.orgId,
        user_id: this.userId,
        provider: this.provider,
        access_token: encryptApiKey(tokens.access_token),
        refresh_token: tokens.refresh_token
          ? encryptApiKey(tokens.refresh_token)
          : null,
        expires_at: expiresAt,
        token_type: tokens.token_type || 'Bearer',
      },
    });
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const record = await db.mcpOAuthToken.findUnique({
      where: {
        organization_id_user_id_provider: {
          organization_id: this.orgId,
          user_id: this.userId,
          provider: this.provider,
        },
      },
    });

    if (!record?.client_id) {
      return undefined;
    }

    return {
      client_id: record.client_id,
      client_secret: record.client_secret
        ? decryptApiKey(record.client_secret)
        : undefined,
    };
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    await db.mcpOAuthToken.upsert({
      where: {
        organization_id_user_id_provider: {
          organization_id: this.orgId,
          user_id: this.userId,
          provider: this.provider,
        },
      },
      update: {
        client_id: info.client_id,
        client_secret: info.client_secret
          ? encryptApiKey(info.client_secret)
          : null,
      },
      create: {
        organization_id: this.orgId,
        user_id: this.userId,
        provider: this.provider,
        access_token: '',
        client_id: info.client_id,
        client_secret: info.client_secret
          ? encryptApiKey(info.client_secret)
          : null,
      },
    });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    this._authorizationUrl = url;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await db.mcpOAuthToken.upsert({
      where: {
        organization_id_user_id_provider: {
          organization_id: this.orgId,
          user_id: this.userId,
          provider: this.provider,
        },
      },
      update: {
        code_verifier: encryptApiKey(verifier),
      },
      create: {
        organization_id: this.orgId,
        user_id: this.userId,
        provider: this.provider,
        access_token: '',
        code_verifier: encryptApiKey(verifier),
      },
    });
  }

  async codeVerifier(): Promise<string> {
    const record = await db.mcpOAuthToken.findUnique({
      where: {
        organization_id_user_id_provider: {
          organization_id: this.orgId,
          user_id: this.userId,
          provider: this.provider,
        },
      },
    });

    if (!record?.code_verifier) {
      throw new Error('No code verifier found');
    }

    return decryptApiKey(record.code_verifier);
  }
}
