import { describe, expect, it } from 'vitest';
import { mcpOAuthPlugins } from '../mcp-oauth-config';

describe('MCP OAuth plugin wiring', () => {
  it('adds no plugin by default or when disabled', () => {
    expect(mcpOAuthPlugins({})).toEqual([]);
    expect(mcpOAuthPlugins({ MCP_OAUTH_ENABLED: 'false' })).toEqual([]);
  });
  it('keeps OAuth closed on invalid configuration while setup can report it', () => {
    expect(mcpOAuthPlugins({ MCP_OAUTH_ENABLED: 'true' })).toEqual([]);
    expect(
      mcpOAuthPlugins({
        MCP_OAUTH_ENABLED: 'true',
        RAGEN_MCP_PUBLIC_URL: 'not-a-url',
      }),
    ).toEqual([]);
    expect(
      mcpOAuthPlugins({
        MCP_OAUTH_ENABLED: 'true',
        RAGEN_MCP_PUBLIC_URL: 'http://mcp.example/mcp',
      }),
    ).toEqual([]);
  });
  it('registers JWT and the MCP preset only when enabled', async () => {
    const plugins = mcpOAuthPlugins({
      MCP_OAUTH_ENABLED: 'true',
      RAGEN_MCP_PUBLIC_URL: 'https://mcp.example/mcp',
    });
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      'jwt',
      'oauth-provider',
    ]);
    const provider = plugins[1];
    if (!provider || provider.id !== 'oauth-provider') {
      throw new Error('Missing OAuth provider');
    }
    expect(provider.options.allowDynamicClientRegistration).toBe(false);
    expect(provider.options.allowUnauthenticatedClientRegistration).toBe(false);
    expect(provider.options.resources).toEqual([
      {
        identifier: 'https://mcp.example/mcp',
        name: 'Ragen MCP',
        allowedScopes: ['openid', 'offline_access', 'mcp:read'],
      },
    ]);
    expect(provider.options.refreshTokenReuseInterval).toBe(0);
    expect(provider.options.clientRegistrationRequirePKCE).toBe(true);
    await expect(
      provider.options.customAccessTokenClaims?.({ scopes: ['mcp:read'] }),
    ).rejects.toThrow('MCP workspace selection');
  });
});
