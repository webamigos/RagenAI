import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockAggregate = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    aiUsage: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
  },
}));

import {
  getTeamUsageQuery,
  getOrgTeamsUsageQuery,
} from '../get-team-usage-query';

const TEAM = {
  id: 'team-1',
  budgetUsdCents: 10_000,
  budgetDuration: '30d',
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAggregate.mockResolvedValue({
    _sum: { estimatedCost: 0, totalTokens: 0 },
    _count: 0,
  });
});

describe('getTeamUsageQuery', () => {
  it('returns null for a team outside the organization', async () => {
    mockFindFirst.mockResolvedValue(null);

    expect(await getTeamUsageQuery('team-1', 'org-1')).toBeNull();
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  it('aggregates spend, tokens and calls from AiUsage', async () => {
    mockFindFirst.mockResolvedValue(TEAM);
    mockAggregate.mockResolvedValue({
      _sum: { estimatedCost: 25, totalTokens: 1234 },
      _count: 7,
    });

    const usage = await getTeamUsageQuery('team-1', 'org-1');

    expect(usage).toMatchObject({
      teamId: 'team-1',
      spendUsd: 25,
      tokenCount: 1234,
      requestCount: 7,
      budgetUsdCents: 10_000,
    });
    expect(usage!.pctOfBudget).toBeCloseTo(25);
  });

  /**
   * The scope that matters: a team's usage must not be able to pick up another
   * organization's rows, and must be bounded by the budget window.
   */
  it('scopes the aggregate by organization, team and window', async () => {
    mockFindFirst.mockResolvedValue(TEAM);

    await getTeamUsageQuery('team-1', 'org-1');

    const [args] = mockAggregate.mock.calls[0] as [
      { where: Record<string, any> },
    ];
    expect(args.where.organizationId).toBe('org-1');
    expect(args.where.teamId).toBe('team-1');
    expect(args.where.createdAt.gte).toBeInstanceOf(Date);
    expect(args.where.createdAt.lte).toBeInstanceOf(Date);
  });

  it('caps the budget percentage at 100 rather than reporting 340%', async () => {
    mockFindFirst.mockResolvedValue({ ...TEAM, budgetUsdCents: 100 });
    mockAggregate.mockResolvedValue({
      _sum: { estimatedCost: 3.4, totalTokens: 0 },
      _count: 1,
    });

    const usage = await getTeamUsageQuery('team-1', 'org-1');

    expect(usage!.pctOfBudget).toBe(100);
  });

  it('reports zero percent for a team with no budget, not Infinity', async () => {
    mockFindFirst.mockResolvedValue({ ...TEAM, budgetUsdCents: 0 });
    mockAggregate.mockResolvedValue({
      _sum: { estimatedCost: 5, totalTokens: 0 },
      _count: 1,
    });

    const usage = await getTeamUsageQuery('team-1', 'org-1');

    expect(usage!.pctOfBudget).toBe(0);
  });

  /**
   * The proxy version swallowed errors and reported zero usage, so an
   * unreachable proxy and a team that spent nothing looked identical on the
   * screen an administrator uses to decide whether a budget is working.
   */
  it('lets a read failure surface instead of reporting zero usage', async () => {
    mockFindFirst.mockResolvedValue(TEAM);
    mockAggregate.mockRejectedValue(new Error('connection reset'));

    await expect(getTeamUsageQuery('team-1', 'org-1')).rejects.toThrow(
      'connection reset',
    );
  });
});

describe('getOrgTeamsUsageQuery', () => {
  it('returns usage keyed by team id', async () => {
    mockFindMany.mockResolvedValue([TEAM, { ...TEAM, id: 'team-2' }]);
    mockFindFirst.mockImplementation(({ where }: any) =>
      Promise.resolve({ ...TEAM, id: where.id }),
    );
    mockAggregate.mockResolvedValue({
      _sum: { estimatedCost: 1, totalTokens: 10 },
      _count: 2,
    });

    const usage = await getOrgTeamsUsageQuery('org-1');

    expect(Object.keys(usage).sort()).toEqual(['team-1', 'team-2']);
    expect(usage['team-2'].spendUsd).toBe(1);
  });
});
