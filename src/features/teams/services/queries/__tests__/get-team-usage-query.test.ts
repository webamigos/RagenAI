import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockSpendLogs = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock('@/libs/litellm/client', () => ({
  getLiteLLMSpendLogs: (...args: unknown[]) => mockSpendLogs(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  getTeamUsageQuery,
  getOrgTeamsUsageQuery,
} from '../get-team-usage-query';

describe('getTeamUsageQuery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('aggregates spend and tokens across log entries', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'team-1',
      litellmTeamId: 'team-1',
      budgetUsdCents: 10_000,
      budgetDuration: '30d',
    });
    mockSpendLogs.mockResolvedValue([
      { spend: 4.2, total_tokens: 100 },
      { spend: 0.8, total_tokens: 50 },
    ]);

    const result = await getTeamUsageQuery('team-1', 'org-1');

    expect(result).toMatchObject({
      teamId: 'team-1',
      spendUsd: 5,
      tokenCount: 150,
      requestCount: 2,
      budgetUsdCents: 10_000,
      pctOfBudget: 5,
    });
  });

  it('clamps pctOfBudget to 100 when over budget', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'team-1',
      litellmTeamId: 'team-1',
      budgetUsdCents: 1_000, // $10
      budgetDuration: '30d',
    });
    mockSpendLogs.mockResolvedValue([{ spend: 50, total_tokens: 1000 }]);

    const result = await getTeamUsageQuery('team-1', 'org-1');

    expect(result?.pctOfBudget).toBe(100);
  });

  it('returns zero usage when LiteLLM spend-log endpoint throws', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'team-1',
      litellmTeamId: 'team-1',
      budgetUsdCents: 10_000,
      budgetDuration: '30d',
    });
    mockSpendLogs.mockRejectedValue(new Error('Failed: 500 down'));

    const result = await getTeamUsageQuery('team-1', 'org-1');

    expect(result).toMatchObject({
      spendUsd: 0,
      tokenCount: 0,
      requestCount: 0,
    });
  });

  it('returns null when team is not in the org', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getTeamUsageQuery('team-1', 'other-org');

    expect(result).toBeNull();
    expect(mockSpendLogs).not.toHaveBeenCalled();
  });

  it('falls back to team.id when litellmTeamId is null (lazy-provisioned)', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'team-1',
      litellmTeamId: null,
      budgetUsdCents: 10_000,
      budgetDuration: '30d',
    });
    mockSpendLogs.mockResolvedValue([]);

    await getTeamUsageQuery('team-1', 'org-1');

    expect(mockSpendLogs).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1' }),
    );
  });

  it('reports zero pct when budget is zero instead of dividing by zero', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'team-1',
      litellmTeamId: 'team-1',
      budgetUsdCents: 0,
      budgetDuration: '30d',
    });
    mockSpendLogs.mockResolvedValue([{ spend: 5, total_tokens: 10 }]);

    const result = await getTeamUsageQuery('team-1', 'org-1');

    expect(result?.pctOfBudget).toBe(0);
  });
});

describe('getOrgTeamsUsageQuery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a map keyed by teamId', async () => {
    mockFindMany.mockResolvedValue([{ id: 'team-a' }, { id: 'team-b' }]);
    mockFindFirst.mockImplementation(
      async (args: { where: { id: string } }) => ({
        id: args.where.id,
        litellmTeamId: args.where.id,
        budgetUsdCents: 10_000,
        budgetDuration: '30d',
      }),
    );
    mockSpendLogs.mockResolvedValue([{ spend: 1, total_tokens: 10 }]);

    const result = await getOrgTeamsUsageQuery('org-1');

    expect(Object.keys(result)).toEqual(['team-a', 'team-b']);
    expect(result['team-a'].spendUsd).toBe(1);
  });
});
