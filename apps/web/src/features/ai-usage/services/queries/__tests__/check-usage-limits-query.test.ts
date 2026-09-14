import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAggregate = vi.fn();
const mockCount = vi.fn();
const mockGetUsageLimits = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    aiUsage: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getUsageLimits: (...args: unknown[]) => mockGetUsageLimits(...args),
}));

import { checkUsageLimitsQuery } from '../check-usage-limits-query';

const NO_LIMITS = {
  monthlyTokenLimit: null,
  monthlyCostLimitCents: null,
  monthlyMessageLimit: null,
  monthlyApiRequestLimit: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUsageLimits.mockResolvedValue(NO_LIMITS);
  mockAggregate.mockResolvedValue({
    _sum: { totalTokens: 0, estimatedCost: 0 },
  });
  mockCount.mockResolvedValue(0);
});

describe('checkUsageLimitsQuery', () => {
  /**
   * The distinction this exists to hold: spend aggregates over every row,
   * because embeddings and reranking cost money, while the message ceiling
   * counts chat turns. One document ingest writes an AiUsage row per embedded
   * chunk, and the admin panel suggests 500 for that ceiling — counting every
   * row against it would refuse chats because somebody uploaded a PDF.
   */
  it('counts only chat completions toward the message ceiling', async () => {
    mockGetUsageLimits.mockResolvedValue({
      ...NO_LIMITS,
      monthlyMessageLimit: 10,
    });
    // 400 rows this month, of which 4 are chat turns and the rest embeddings.
    mockAggregate.mockResolvedValue({
      _sum: { totalTokens: 120_000, estimatedCost: 1.5 },
    });
    mockCount.mockImplementation((args: any) =>
      Promise.resolve(args.where.metadata ? 0 : 4),
    );

    const status = await checkUsageLimitsQuery('org_1');

    expect(status.current.totalMessages).toBe(4);
    expect(status.exceeded.messages).toBe(false);
    expect(status.isAnyLimitExceeded).toBe(false);
  });

  it('scopes the message count to CHAT_COMPLETION, not to every step', async () => {
    await checkUsageLimitsQuery('org_1');

    const messageCountArgs = mockCount.mock.calls.find(
      ([args]: any) => !args.where.metadata,
    )?.[0];
    expect(messageCountArgs.where.step).toBe('CHAT_COMPLETION');
    expect(messageCountArgs.where.organizationId).toBe('org_1');
  });

  it('aggregates spend over every step, including embeddings', async () => {
    await checkUsageLimitsQuery('org_1');

    const [aggregateArgs] = mockAggregate.mock.calls[0] as any;
    expect(aggregateArgs.where.step).toBeUndefined();
    expect(aggregateArgs._sum).toEqual({
      totalTokens: true,
      estimatedCost: true,
    });
  });

  it('keeps the API request count separate, filtered by source', async () => {
    mockGetUsageLimits.mockResolvedValue({
      ...NO_LIMITS,
      monthlyApiRequestLimit: 1,
    });
    mockCount.mockImplementation((args: any) =>
      Promise.resolve(args.where.metadata ? 5 : 0),
    );

    const status = await checkUsageLimitsQuery('org_1');

    expect(status.current.apiRequests).toBe(5);
    expect(status.current.totalMessages).toBe(0);
    expect(status.exceeded.apiRequests).toBe(true);
  });

  it('exceeds nothing when every ceiling is null', async () => {
    mockAggregate.mockResolvedValue({
      _sum: { totalTokens: 9_999_999, estimatedCost: 999 },
    });
    mockCount.mockResolvedValue(9999);

    const status = await checkUsageLimitsQuery('org_1');

    expect(status.isAnyLimitExceeded).toBe(false);
  });

  it('exceeds the cost ceiling at exactly the limit, in cents', async () => {
    mockGetUsageLimits.mockResolvedValue({
      ...NO_LIMITS,
      monthlyCostLimitCents: 500,
    });
    mockAggregate.mockResolvedValue({
      _sum: { totalTokens: 0, estimatedCost: 5 },
    });

    const status = await checkUsageLimitsQuery('org_1');

    expect(status.current.totalCostCents).toBe(500);
    expect(status.exceeded.cost).toBe(true);
  });
});
