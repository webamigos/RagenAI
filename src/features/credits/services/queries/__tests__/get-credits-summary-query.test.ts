import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const mockBalanceFind = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
const mockPlanFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    orgCreditBalance: {
      findUnique: (...a: unknown[]) => mockBalanceFind(...a),
    },
    subscription: {
      findFirst: (...a: unknown[]) => mockSubscriptionFindFirst(...a),
    },
    subscriptionPlan: {
      findFirst: (...a: unknown[]) => mockPlanFindFirst(...a),
    },
  },
}));

vi.mock(
  '@/features/credits/services/commands/ensure-plan-grant-command',
  () => ({
    ensurePlanGrantCommand: vi.fn().mockResolvedValue(undefined),
  }),
);

const { getCreditsSummaryQuery } = await import('../get-credits-summary-query');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('getCreditsSummaryQuery', () => {
  it('returns zeroed balance + null plan fields when org has nothing', async () => {
    mockBalanceFind.mockResolvedValue(null);
    mockSubscriptionFindFirst.mockResolvedValue(null);

    const result = await getCreditsSummaryQuery('org-1');

    expect(result).toEqual({
      balance: 0,
      lifetimeGranted: 0,
      lifetimeSpent: 0,
      planMonthlyCredits: null,
      nextResetAt: null,
      planName: null,
    });
  });

  it('computes nextResetAt one month after the current period anchor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'));

    mockBalanceFind.mockResolvedValue({
      organizationId: 'org-1',
      balance: 420,
      lifetimeGranted: 1000,
      lifetimeSpent: 580,
      updatedAt: new Date(),
    });
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      periodStart: new Date('2026-01-15T00:00:00Z'),
      periodEnd: new Date('2027-01-15T00:00:00Z'),
    });
    mockPlanFindFirst.mockResolvedValue({ limits: { monthlyCredits: 2000 } });

    const result = await getCreditsSummaryQuery('org-1');

    expect(result.balance).toBe(420);
    expect(result.planMonthlyCredits).toBe(2000);
    expect(result.planName).toBe('Pro');
    // Current anchor 2026-03-15 → next reset 2026-04-15
    expect(result.nextResetAt?.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('falls back to default monthly credits when plan has none defined', async () => {
    mockBalanceFind.mockResolvedValue({
      organizationId: 'org-1',
      balance: 100,
      lifetimeGranted: 500,
      lifetimeSpent: 400,
      updatedAt: new Date(),
    });
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Starter',
      periodStart: new Date('2026-01-15T00:00:00Z'),
      periodEnd: null,
    });
    mockPlanFindFirst.mockResolvedValue({ limits: {} });

    const result = await getCreditsSummaryQuery('org-1');
    expect(result.planMonthlyCredits).toBe(500);
  });

  it('returns null nextResetAt when subscription has already ended', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));

    mockBalanceFind.mockResolvedValue({
      organizationId: 'org-1',
      balance: 10,
      lifetimeGranted: 500,
      lifetimeSpent: 490,
      updatedAt: new Date(),
    });
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      periodStart: new Date('2026-01-15T00:00:00Z'),
      periodEnd: new Date('2026-03-15T00:00:00Z'),
    });
    mockPlanFindFirst.mockResolvedValue({ limits: { monthlyCredits: 1000 } });

    const result = await getCreditsSummaryQuery('org-1');
    expect(result.nextResetAt).toBeNull();
  });
});
