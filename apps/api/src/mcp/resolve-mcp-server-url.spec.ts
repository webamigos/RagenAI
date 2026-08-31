import { resolveMcpServerUrl, type McpConnectorInfo } from './client.js';
import type { ProviderDefinition } from '../connectors/types.js';

// Minimal fixture factory so every test only overrides what it cares about.
function connector(
  overrides: Partial<McpConnectorInfo> = {},
): McpConnectorInfo {
  return {
    id: 'conn-1',
    provider: 'REJESTRIO',
    mcpServerUrl: 'http://old-stale-url:0/mcp',
    customerId: 'org:user:provider',
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  };
}

function providerDef(
  overrides: Partial<ProviderDefinition> = {},
): ProviderDefinition {
  return {
    provider: 'REJESTRIO',
    name: 'Rejestr.io',
    description: 'x',
    icon: 'x',
    mcpServerUrl: 'http://live-url:9004/mcp',
    authType: 'server_side',
    ...overrides,
  };
}

describe('resolveMcpServerUrl', () => {
  it('prefers the live provider-registry URL over the stored one (fixed-URL case)', () => {
    const url = resolveMcpServerUrl(connector(), providerDef());
    expect(url).toBe('http://live-url:9004/mcp');
  });

  it('uses the stored per-connector URL for api_key_custom_header providers', () => {
    // WooCommerce — URL composed from the user's shop address at
    // registration time; env has no knowledge of it.
    const stored = 'https://shop.example.com/wp-json/woocommerce/mcp';
    const url = resolveMcpServerUrl(
      connector({ mcpServerUrl: stored, provider: 'WOOCOMMERCE' }),
      providerDef({
        provider: 'WOOCOMMERCE' as ProviderDefinition['provider'],
        authType: 'api_key_custom_header',
        headerName: 'X-MCP-API-Key',
      }),
    );
    expect(url).toBe(stored);
  });

  it('falls back to the stored URL when providerDef is missing entirely', () => {
    const url = resolveMcpServerUrl(
      connector({ mcpServerUrl: 'http://last-resort/mcp' }),
      undefined,
    );
    expect(url).toBe('http://last-resort/mcp');
  });

  it('live URL applies even if an old stored URL drifted (regression for port 9001/9004 incident)', () => {
    const url = resolveMcpServerUrl(
      connector({ mcpServerUrl: 'http://localhost:9001/mcp' }),
      providerDef({ mcpServerUrl: 'http://localhost:9004/mcp' }),
    );
    expect(url).toBe('http://localhost:9004/mcp');
  });

  it('applies live URL for every non-custom-header auth type', () => {
    for (const authType of [
      'oauth',
      'api_key',
      'api_key_bearer',
      'external_mcp',
      'server_side',
    ] as const) {
      const url = resolveMcpServerUrl(
        connector({ mcpServerUrl: 'http://stale/mcp' }),
        providerDef({ authType, mcpServerUrl: 'http://live/mcp' }),
      );
      expect(url).toBe('http://live/mcp');
    }
  });
});
