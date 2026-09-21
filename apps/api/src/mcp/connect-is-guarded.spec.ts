/**
 * Every branch that opens an MCP session has to go through the address policy
 * when the definition carries a guard. This is the test that was missing when
 * the `external_mcp` branch here kept a bare client while apps/web's sibling
 * was moved onto the guarded transport — a divergence nothing else notices,
 * because both apps compile and both suites pass.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateMCPClient = vi.fn();
vi.mock('@ai-sdk/mcp', () => ({
  createMCPClient: (...args: unknown[]) => mockCreateMCPClient(...args),
}));

const mockCreateGuardedMcpTransport = vi.fn();
const mockGuardedClose = vi.fn();
vi.mock('@ragenai/connector-guard', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    createGuardedMcpTransport: (...args: unknown[]) =>
      mockCreateGuardedMcpTransport(...args),
  };
});

const mockGetToken = vi.fn();
vi.mock('../ragen-vault/index.js', () => ({
  ragenAuthClient: { getToken: (...args: unknown[]) => mockGetToken(...args) },
  RagenAuthOAuthClientProvider: class {
    constructor(public readonly options: unknown) {}
  },
}));

const { createMcpToolsFromConnectors } = await import('./client.js');

const connector = {
  id: 'connector-1',
  provider: 'notion',
  mcpServerUrl: 'https://mcp.example.test/mcp',
  customerId: 'org-1:user-1:notion',
  organizationId: 'org-1',
  userId: 'user-1',
};

function definitions(authType: string) {
  return {
    notion: {
      provider: 'notion',
      name: 'Notion',
      authType,
      mcpServerUrl: 'https://mcp.example.test/mcp',
      headerName: 'X-MCP-API-Key',
      // What an operator-created row produces: an address somebody typed.
      addressGuard: { allowPrivate: false },
    },
  } as never;
}

describe('opening a session against an operator-typed address', () => {
  beforeEach(() => {
    mockCreateMCPClient.mockReset().mockResolvedValue({
      tools: vi.fn().mockResolvedValue({}),
      close: vi.fn(),
    });
    mockCreateGuardedMcpTransport.mockReset().mockReturnValue({
      transport: { __guarded: true },
      close: mockGuardedClose,
    });
    mockGetToken.mockReset().mockResolvedValue({ accessToken: 'token' });
  });

  it.each([
    ['external_mcp'],
    ['api_key_bearer'],
    ['api_key_custom_header'],
    ['oauth'],
  ])('goes through the guarded transport for %s', async (authType) => {
    await createMcpToolsFromConnectors(
      [connector],
      undefined,
      definitions(authType),
    );

    expect(mockCreateGuardedMcpTransport).toHaveBeenCalledTimes(1);
    expect(mockCreateMCPClient).toHaveBeenCalledWith({
      transport: { __guarded: true },
    });
  });

  it('carries the OAuth provider onto the guarded transport, not around it', async () => {
    await createMcpToolsFromConnectors(
      [connector],
      undefined,
      definitions('external_mcp'),
    );

    const [url, headers, options] =
      mockCreateGuardedMcpTransport.mock.calls[0] ?? [];
    expect(url).toBe('https://mcp.example.test/mcp');
    expect(headers).toEqual({});
    expect(options.authProvider).toBeDefined();
  });

  it('closes the guard alongside the client', async () => {
    const { closeAll } = await createMcpToolsFromConnectors(
      [connector],
      undefined,
      definitions('external_mcp'),
    );

    await closeAll();

    expect(mockGuardedClose).toHaveBeenCalledTimes(1);
  });

  it('leaves a built-in with no guard on the plain transport', async () => {
    const builtIn = {
      notion: {
        provider: 'notion',
        name: 'Notion',
        authType: 'external_mcp',
        mcpServerUrl: 'https://mcp.example.test/mcp',
        // No addressGuard: the URL came from MCP_*_SERVER_URL, which is the
        // deployer's own and may legitimately be loopback.
      },
    } as never;

    await createMcpToolsFromConnectors([connector], undefined, builtIn);

    expect(mockCreateGuardedMcpTransport).not.toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    const [{ transport }] = mockCreateMCPClient.mock.calls[0] as [
      { transport: { type: string; url: string } },
    ];
    expect(transport.type).toBe('http');
    expect(transport.url).toBe('https://mcp.example.test/mcp');
  });
});

/**
 * The sibling of `apps/web/src/libs/mcp/__tests__/connect-is-guarded.test.ts`'s
 * block of the same name. This pair exists because the two clients are copies
 * and have drifted before; the scheme is the newest thing they have to agree
 * on.
 */
describe('the scheme a session is opened with', () => {
  beforeEach(() => {
    mockCreateMCPClient.mockReset().mockResolvedValue({
      tools: vi.fn().mockResolvedValue({}),
      close: vi.fn(),
    });
    mockCreateGuardedMcpTransport.mockReset().mockReturnValue({
      transport: { __guarded: true },
      close: mockGuardedClose,
    });
    mockGetToken.mockReset().mockResolvedValue({ accessToken: 'token' });
  });

  it('admits http when that is the scheme the entry was saved with', async () => {
    // The regression: the call site passed no `allowedProtocols`, so the
    // guard's https-only default refused every `http://` catalogue entry —
    // after `/mcp-catalogue`'s form had accepted it and Test connection had
    // reported it working, tool names and all.
    const httpEntry = {
      notion: {
        provider: 'notion',
        name: 'Notion',
        authType: 'api_key_bearer',
        // An operator's own MCP server on an internal network: no
        // certificate, so no https.
        mcpServerUrl: 'http://10.0.0.5:9005/mcp',
        addressGuard: { allowPrivate: true },
      },
    } as never;

    await createMcpToolsFromConnectors(
      [{ ...connector, mcpServerUrl: 'http://10.0.0.5:9005/mcp' }],
      undefined,
      httpEntry,
    );

    const options = mockCreateGuardedMcpTransport.mock.calls[0]?.[2] as {
      allowedProtocols?: string[];
    };
    expect(options.allowedProtocols).toEqual(['http:', 'https:']);
  });

  it('keeps an https entry on https, so a redirect cannot downgrade it', async () => {
    await createMcpToolsFromConnectors(
      [connector],
      undefined,
      definitions('api_key_bearer'),
    );

    const options = mockCreateGuardedMcpTransport.mock.calls[0]?.[2] as {
      allowedProtocols?: string[];
    };
    expect(options.allowedProtocols).toEqual(['https:']);
  });
});
