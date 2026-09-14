import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckUsageLimits = vi.fn();

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock(
  '@/features/ai-usage/services/queries/check-usage-limits-query',
  () => ({
    checkUsageLimitsQuery: (...args: unknown[]) =>
      mockCheckUsageLimits(...args),
  }),
);

import { refuseIfOverUsageCeiling } from '../check-usage-ceilings';

function status(exceeded: Record<string, boolean> = {}) {
  const flags = {
    tokens: false,
    cost: false,
    messages: false,
    apiRequests: false,
    ...exceeded,
  };
  return {
    limits: {
      monthlyTokenLimit: 1000,
      monthlyCostLimitCents: 500,
      monthlyMessageLimit: 100,
      monthlyApiRequestLimit: 10,
    },
    current: {
      totalTokens: 10,
      totalCostCents: 20,
      totalMessages: 3,
      apiRequests: 99,
    },
    exceeded: flags,
    isAnyLimitExceeded: Object.values(flags).some(Boolean),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('refuseIfOverUsageCeiling', () => {
  it('returns null when nothing is exceeded', async () => {
    mockCheckUsageLimits.mockResolvedValue(status());

    expect(await refuseIfOverUsageCeiling('org_1')).toBeNull();
  });

  /**
   * The API request quota is checked by `checkApiRequestLimit`, which sits
   * beside every call to this. Reporting it here too would refuse with the
   * wrong body and count the same ceiling twice.
   */
  it('ignores the API request quota, which its neighbour owns', async () => {
    const overApiOnly = status({ apiRequests: true });
    expect(overApiOnly.isAnyLimitExceeded).toBe(true);
    mockCheckUsageLimits.mockResolvedValue(overApiOnly);

    expect(await refuseIfOverUsageCeiling('org_1')).toBeNull();
  });

  it('refuses with 429 and names every ceiling that is over', async () => {
    mockCheckUsageLimits.mockResolvedValue(
      status({ tokens: true, cost: true }),
    );

    const response = await refuseIfOverUsageCeiling('org_1');

    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    const body = await response!.json();
    expect(body.error).toBe('Monthly usage limit exceeded');
    expect(body.code).toBe(429);
    expect(body.exceeded).toEqual(['tokens', 'cost']);
  });

  /**
   * Unlike the chat surfaces, the caller here is an integration: it can act on
   * the difference between "out of tokens" and "out of budget", and it has
   * nowhere else to read it.
   */
  it('reports the counters and the ceilings, for a client that has no panel', async () => {
    mockCheckUsageLimits.mockResolvedValue(status({ messages: true }));

    const body = await (await refuseIfOverUsageCeiling('org_1'))!.json();

    expect(body.current).toEqual({
      totalTokens: 10,
      totalCostCents: 20,
      totalMessages: 3,
    });
    expect(body.limits).toEqual({
      monthlyTokenLimit: 1000,
      monthlyCostLimitCents: 500,
      monthlyMessageLimit: 100,
    });
    expect(body.current.apiRequests).toBeUndefined();
  });
});
