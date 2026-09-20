import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpConnector: { findMany: (...a: unknown[]) => mockFindMany(...a) },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { getEnabledConnectorsQuery } from '../get-enabled-connectors-query';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    provider: 'SLACK',
    providerSlug: 'SLACK',
    mcpServerUrl: 'https://mcp.slack.com/mcp',
    customerId: 'org:user:slack',
    organizationId: 'org',
    userId: 'user',
    status: 'CONNECTED',
    ...over,
  };
}

describe('the enabled-connectors query', () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([row()]);
  });

  it('reads both columns, because one of them is on its way out', () => {
    return getEnabledConnectorsQuery('org', 'user').then(() => {
      const select = (mockFindMany.mock.calls[0][0] as { select: object })
        .select;
      expect(select).toMatchObject({ provider: true, providerSlug: true });
    });
  });

  it('hands downstream one provider, and it is the slug', async () => {
    mockFindMany.mockResolvedValue([
      row({ providerSlug: 'notion', provider: 'SLACK' }),
    ]);

    const [connector] = await getEnabledConnectorsQuery('org', 'user');

    // This is the seam: the allowlist filter, the project filter and the tool
    // loader all read `provider`, and after this query it is the catalogue
    // slug rather than the enum column.
    expect(connector.provider).toBe('notion');
  });

  it('falls back to the enum column for a row an older service wrote', async () => {
    mockFindMany.mockResolvedValue([row({ providerSlug: null })]);

    const [connector] = await getEnabledConnectorsQuery('org', 'user');

    expect(connector.provider).toBe('SLACK');
  });
});
