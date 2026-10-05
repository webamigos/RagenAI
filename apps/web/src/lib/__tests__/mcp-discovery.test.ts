import { describe, expect, it, vi } from 'vitest';
import { mcpDiscovery } from '../mcp-discovery';

const enabled = {
  MCP_OAUTH_ENABLED: 'true',
  RAGEN_MCP_PUBLIC_URL: 'https://mcp.example/mcp',
};
describe('root MCP discovery', () => {
  it.each(['oauth-authorization-server', 'openid-configuration'] as const)(
    'delegates %s to Better Auth',
    async (document) => {
      const response = Response.json({
        issuer: 'https://app.example/api/auth',
      });
      const handler = vi.fn().mockResolvedValue(response);
      const result = await mcpDiscovery(
        new Request(`https://app.example/.well-known/${document}`, {
          headers: { accept: 'application/json' },
        }),
        document,
        handler,
        enabled,
      );
      expect(result).toBe(response);
      const request = handler.mock.calls[0][0] as Request;
      expect(request.url).toBe(
        `https://app.example/api/auth/.well-known/${document}`,
      );
      expect(request.headers.get('accept')).toBe('application/json');
    },
  );
  it.each([{}, { MCP_OAUTH_ENABLED: 'false' }, { MCP_OAUTH_ENABLED: 'true' }])(
    'does not expose discovery with disabled or invalid configuration',
    async (source) => {
      const handler = vi.fn();
      const result = await mcpDiscovery(
        new Request('https://app.example/.well-known/openid-configuration'),
        'openid-configuration',
        handler,
        source,
      );
      expect(result.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    },
  );
  it('preserves HEAD for the provider', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null));
    await mcpDiscovery(
      new Request('https://app.example/.well-known/openid-configuration', {
        method: 'HEAD',
      }),
      'openid-configuration',
      handler,
      enabled,
    );
    expect(handler.mock.calls[0][0].method).toBe('HEAD');
  });
});
