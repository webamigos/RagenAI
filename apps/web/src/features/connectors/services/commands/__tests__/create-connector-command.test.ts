import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsert = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockTrackAudit = vi.fn();
const mockGetProviderDef = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpConnector: { upsert: (...args: unknown[]) => mockUpsert(...args) },
  },
}));

vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({
    trackAudit: (...args: unknown[]) => mockTrackAudit(...args),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...args: unknown[]) =>
      mockIsFeatureEnabled(...args),
  }),
);

vi.mock('../../constants/providers', () => ({
  getProviderDefinition: (...args: unknown[]) => mockGetProviderDef(...args),
}));

import { createConnectorCommand } from '../create-connector-command';

const ORG = 'org-1';
const USER = 'user-1';

describe('createConnectorCommand feature gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviderDef.mockReturnValue({
      mcpServerUrl: 'https://example.com/mcp',
      authType: 'external_mcp',
    });
  });

  it('rejects when mcpConnectors feature is disabled', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    await expect(
      createConnectorCommand(ORG, USER, 'CLICKUP' as any),
    ).rejects.toThrow(/MCP connectors are not enabled/);

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('upserts the connector when feature is enabled', async () => {
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockUpsert.mockResolvedValue({
      id: 'conn-1',
      provider: 'CLICKUP',
      customerId: `${ORG}:${USER}:clickup`,
      mcpServerUrl: 'https://example.com/mcp',
      status: 'PENDING',
    });

    const result = await createConnectorCommand(ORG, USER, 'CLICKUP' as any);

    expect(result.id).toBe('conn-1');
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId_provider: {
            organizationId: ORG,
            userId: USER,
            provider: 'CLICKUP',
          },
        },
      }),
    );
  });
});
