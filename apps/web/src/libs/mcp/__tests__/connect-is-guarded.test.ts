/**
 * Every branch that opens an MCP session goes through the address policy when
 * the definition carries a guard.
 *
 * The sibling of this file is `apps/api/src/mcp/connect-is-guarded.spec.ts`,
 * and the pair exists because the two clients are copies (see
 * `apps/api/AGENTS.md` on the ported libs): apps/api's `external_mcp` branch
 * kept a bare client after this one had been moved onto the guarded transport,
 * and nothing failed — both apps compiled, both suites passed.
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
vi.mock('@/libs/ragen-vault', () => ({
  ragenAuthClient: { getToken: (...args: unknown[]) => mockGetToken(...args) },
  RagenAuthOAuthClientProvider: class {
    constructor(public readonly options: unknown) {}
  },
}));

vi.mock(
  '@/features/connectors/services/queries/get-connector-credentials-query',
  () => ({
    getConnectorOAuthCredentialsQuery: vi
      .fn()
      .mockResolvedValue({ clientId: 'id', clientSecret: 'secret' }),
  }),
);

vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({
    recordSecurityEvent: vi.fn(),
  }),
);

vi.mock(
  '@/features/connectors/services/commands/record-connector-failure-command',
  () => ({
    clearConnectorFailureCommand: vi.fn(),
    recordConnectorFailureCommand: vi.fn(),
  }),
);

const { createMcpToolsFromConnectors } = await import('../client');

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
    mockGuardedClose.mockReset();
    mockGetToken.mockReset().mockResolvedValue({ accessToken: 'token' });
  });

  it.each([
    ['external_mcp'],
    ['api_key_bearer'],
    ['api_key_custom_header'],
    ['oauth'],
  ])('goes through the guarded transport for %s', async (authType) => {
    await createMcpToolsFromConnectors([connector], definitions(authType));

    expect(mockCreateGuardedMcpTransport).toHaveBeenCalledTimes(1);
    expect(mockCreateMCPClient).toHaveBeenCalledWith({
      transport: { __guarded: true },
    });
  });

  it('carries the OAuth provider onto the guarded transport, not around it', async () => {
    await createMcpToolsFromConnectors(
      [connector],
      definitions('external_mcp'),
    );

    const [url, headers, options] =
      mockCreateGuardedMcpTransport.mock.calls[0] ?? [];
    expect(url).toBe('https://mcp.example.test/mcp');
    expect(headers).toEqual({});
    expect(options.authProvider).toBeDefined();
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

    await createMcpToolsFromConnectors([connector], builtIn);

    expect(mockCreateGuardedMcpTransport).not.toHaveBeenCalled();
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
  });
});
