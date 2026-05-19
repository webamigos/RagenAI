import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RagenAuthOAuthClientProvider } from '../oauth-provider';
import { McpConnectorProvider } from '@/generated/prisma/client';

vi.mock('../client', () => ({
  ragenAuthClient: {
    getToken: vi.fn(),
    storeToken: vi.fn(),
    deleteToken: vi.fn(),
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const baseOpts = {
  orgId: 'org-1',
  userId: 'user-1',
  callbackUrl: 'https://app.ragen.ai/api/connectors/external/callback',
};

describe('RagenAuthOAuthClientProvider.redirectToAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HubSpot rewrite', () => {
    it('rewrites mcp-eu1 gateway URL to standard app-eu1 OAuth endpoint', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.HUBSPOT,
      });

      const mcpUrl = new URL(
        'https://mcp-eu1.hubspot.com/oauth/139779799/authorize?response_type=code&client_id=abc123&code_challenge=xxxx&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fapp.ragen.ai%2Fcb&scope=oauth+crm.objects.contacts.read&resource=https%3A%2F%2Fmcp.hubspot.com%2F',
      );

      await provider.redirectToAuthorization(mcpUrl);

      const rewritten = provider.authorizationUrl!;
      expect(rewritten.origin).toBe('https://app-eu1.hubspot.com');
      expect(rewritten.pathname).toBe('/oauth/authorize');
      expect(rewritten.searchParams.get('client_id')).toBe('abc123');
      expect(rewritten.searchParams.get('redirect_uri')).toBe(
        'https://app.ragen.ai/cb',
      );
      expect(rewritten.searchParams.get('scope')).toBe(
        'oauth crm.objects.contacts.read',
      );
      // PKCE + resource params should be stripped — HubSpot's classic OAuth
      // does not accept them on the authorize URL.
      expect(rewritten.searchParams.get('code_challenge')).toBeNull();
      expect(rewritten.searchParams.get('code_challenge_method')).toBeNull();
      expect(rewritten.searchParams.get('resource')).toBeNull();
    });

    it('preserves region prefix from the incoming URL (na1 → app-na1)', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.HUBSPOT,
      });

      const mcpUrl = new URL(
        'https://mcp-na1.hubspot.com/oauth/123/authorize?client_id=xyz',
      );

      await provider.redirectToAuthorization(mcpUrl);

      expect(provider.authorizationUrl!.origin).toBe(
        'https://app-na1.hubspot.com',
      );
    });

    it('defaults to eu1 when the incoming URL host is not the MCP gateway pattern', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.HUBSPOT,
      });

      await provider.redirectToAuthorization(
        new URL('https://hubspot.com/oauth/authorize?client_id=fallback'),
      );

      expect(provider.authorizationUrl!.origin).toBe(
        'https://app-eu1.hubspot.com',
      );
      expect(provider.authorizationUrl!.searchParams.get('client_id')).toBe(
        'fallback',
      );
    });

    it('drops literal "null" state values (the SDK encodes missing state this way)', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.HUBSPOT,
      });

      await provider.redirectToAuthorization(
        new URL(
          'https://mcp-eu1.hubspot.com/oauth/1/authorize?client_id=abc&state=null',
        ),
      );

      expect(provider.authorizationUrl!.searchParams.has('state')).toBe(false);
    });

    it('preserves real state values', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.HUBSPOT,
      });

      await provider.redirectToAuthorization(
        new URL(
          'https://mcp-eu1.hubspot.com/oauth/1/authorize?client_id=abc&state=opaque-csrf-token',
        ),
      );

      expect(provider.authorizationUrl!.searchParams.get('state')).toBe(
        'opaque-csrf-token',
      );
    });
  });

  describe('Slack rewrite (useUserScope)', () => {
    it('moves scope → user_scope on the v2 endpoint', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.SLACK,
        useUserScope: true,
      });

      await provider.redirectToAuthorization(
        new URL(
          'https://slack.com/oauth/v2_user/authorize?client_id=x&scope=search%3Aread',
        ),
      );

      const rewritten = provider.authorizationUrl!;
      expect(rewritten.pathname).toBe('/oauth/v2/authorize');
      expect(rewritten.searchParams.get('scope')).toBeNull();
      expect(rewritten.searchParams.get('user_scope')).toBe('search:read');
    });
  });

  describe('passthrough for other providers', () => {
    it('leaves the URL untouched for providers without rewrite rules', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.CLICKUP,
      });

      const original = new URL(
        'https://app.clickup.com/oauth/authorize?client_id=cu',
      );
      await provider.redirectToAuthorization(original);

      expect(provider.authorizationUrl!.toString()).toBe(original.toString());
    });
  });
});
