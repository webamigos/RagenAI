jest.mock('./client.js', () => ({
  ragenAuthClient: {
    getToken: jest.fn(),
    storeToken: jest.fn(),
    deleteToken: jest.fn(),
  },
}));

import { RagenAuthOAuthClientProvider } from './oauth-provider.js';
import { McpConnectorProvider } from '../generated/prisma/client.js';

const baseOpts = {
  orgId: 'org-1',
  userId: 'user-1',
  callbackUrl: 'https://app.ragen.ai/api/connectors/external/callback',
};

describe('RagenAuthOAuthClientProvider.redirectToAuthorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('HubSpot (no rewrite — MCP Auth App handles its own OAuth)', () => {
    it('leaves the HubSpot MCP gateway URL untouched', async () => {
      const provider = new RagenAuthOAuthClientProvider({
        ...baseOpts,
        provider: McpConnectorProvider.HUBSPOT,
      });

      const mcpUrl = new URL(
        'https://mcp-eu1.hubspot.com/oauth/authorize/user?client_id=abc123&code_challenge=xxxx&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fapp.ragen.ai%2Fcb',
      );

      await provider.redirectToAuthorization(mcpUrl);

      expect(provider.authorizationUrl!.toString()).toBe(mcpUrl.toString());
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
