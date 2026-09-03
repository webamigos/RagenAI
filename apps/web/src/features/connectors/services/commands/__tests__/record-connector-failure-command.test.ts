import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockRecordSecurityEvent = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpConnector: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({
    recordSecurityEvent: (...args: unknown[]) =>
      mockRecordSecurityEvent(...args),
  }),
);

const {
  clearConnectorFailureCommand,
  describeConnectorError,
  looksLikeAuthFailure,
  recordConnectorFailureCommand,
} = await import('../record-connector-failure-command');

const BASE = {
  organizationId: 'org-1',
  userId: 'user-1',
  provider: 'SLACK' as const,
  source: 'runtime_init' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockFindUnique.mockResolvedValue({ id: 'conn-1' });
  mockCreate.mockResolvedValue({ id: 'conn-1' });
});

describe('describeConnectorError', () => {
  it('collapses whitespace so a multi-line error fits a table cell', () => {
    expect(describeConnectorError(new Error('failed\n  to   connect'))).toBe(
      'failed to connect',
    );
  });

  it('truncates a very long body', () => {
    // Some MCP servers answer a failed handshake with a whole HTML page.
    const reason = describeConnectorError(new Error('x'.repeat(900)));

    expect(reason.length).toBe(500);
    expect(reason.endsWith('…')).toBe(true);
  });

  it('survives a thrown non-Error', () => {
    expect(describeConnectorError('boom')).toBe('boom');
    expect(describeConnectorError(null)).toBe('Unknown error');
  });
});

describe('looksLikeAuthFailure', () => {
  it.each([
    'HTTP 401 Unauthorized',
    'invalid_grant',
    'token expired',
    'Access denied by provider',
    'Request failed with status 403',
  ])('treats %s as an authorization problem', (reason) => {
    expect(looksLikeAuthFailure(reason)).toBe(true);
  });

  /**
   * The distinction matters because only auth failures raise
   * `MCP_OAUTH_FAILED`. Filing a remote outage there would put an
   * infrastructure blip in the bucket somebody searches for credential
   * problems.
   */
  it.each([
    'fetch failed',
    'HTTP 503 Service Unavailable',
    'socket hang up',
    'Timeout after 30000ms',
  ])('treats %s as an outage, not an authorization problem', (reason) => {
    expect(looksLikeAuthFailure(reason)).toBe(false);
  });
});

describe('recordConnectorFailureCommand', () => {
  it('marks the connector ERROR with the reason and a timestamp', async () => {
    await recordConnectorFailureCommand({
      ...BASE,
      error: new Error('fetch failed'),
    });

    const [args] = mockUpdateMany.mock.calls[0]!;
    expect(args).toMatchObject({
      where: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        provider: 'SLACK',
      }),
      data: expect.objectContaining({
        status: 'ERROR',
        lastError: 'fetch failed',
      }),
    });
    expect(args.data.lastErrorAt).toBeInstanceOf(Date);
  });

  /**
   * This runs once per broken connector per chat message. An unconditional
   * update would rewrite the same row for as long as the fault lasts, so the
   * `where` must exclude a row that already says exactly this.
   */
  it('only matches a row whose stored state differs', async () => {
    await recordConnectorFailureCommand({
      ...BASE,
      error: new Error('fetch failed'),
    });

    const [args] = mockUpdateMany.mock.calls[0]!;
    expect(args.where.OR).toEqual([
      { status: { not: 'ERROR' } },
      { lastError: { not: 'fetch failed' } },
    ]);
  });

  it('writes nothing more when the same fault is already recorded', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({ id: 'conn-1' });

    await recordConnectorFailureCommand({
      ...BASE,
      error: new Error('fetch failed'),
    });

    expect(mockCreate).not.toHaveBeenCalled();
    // No duplicate event either — a persistent fault must not re-alert on
    // every message.
    expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
  });

  it('creates the row when a first-ever connect failed', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue(null);

    await recordConnectorFailureCommand({
      ...BASE,
      source: 'oauth_callback',
      mcpServerUrl: 'https://mcp.example/mcp',
      error: new Error('invalid_grant'),
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        provider: 'SLACK',
        mcpServerUrl: 'https://mcp.example/mcp',
        customerId: 'org-1:user-1:slack',
        status: 'ERROR',
        lastError: 'invalid_grant',
      }),
    });
  });

  it('cannot create a row without a server URL, and does not try', async () => {
    // `mcpServerUrl` and `customerId` are required columns, so the runtime
    // path — which has no provider definition to hand — must not invent one.
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue(null);

    await recordConnectorFailureCommand({
      ...BASE,
      error: new Error('fetch failed'),
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('raises MCP_OAUTH_FAILED for an authorization failure', async () => {
    await recordConnectorFailureCommand({
      ...BASE,
      error: new Error('HTTP 401 Unauthorized'),
    });

    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'MCP_OAUTH_FAILED',
        source: 'mcp',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('does not raise it for an outage', async () => {
    await recordConnectorFailureCommand({
      ...BASE,
      error: new Error('HTTP 503 Service Unavailable'),
    });

    expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
  });

  /**
   * The caller is a chat request that has already lost these tools. Failing
   * to record the fault must not also fail the user's message.
   */
  it('never throws when the write fails', async () => {
    mockUpdateMany.mockRejectedValue(new Error('database gone'));

    await expect(
      recordConnectorFailureCommand({ ...BASE, error: new Error('x') }),
    ).resolves.toBeUndefined();
  });
});

describe('clearConnectorFailureCommand', () => {
  it('restores CONNECTED and drops the stale reason', async () => {
    await clearConnectorFailureCommand({
      organizationId: 'org-1',
      userId: 'user-1',
      provider: 'SLACK',
    });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org-1',
        OR: [{ status: 'ERROR' }, { lastError: { not: null } }],
      }),
      data: { status: 'CONNECTED', lastError: null, lastErrorAt: null },
    });
  });

  it('never throws', async () => {
    mockUpdateMany.mockRejectedValue(new Error('database gone'));

    await expect(
      clearConnectorFailureCommand({
        organizationId: 'org-1',
        userId: 'user-1',
        provider: 'SLACK',
      }),
    ).resolves.toBeUndefined();
  });
});
