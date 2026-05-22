import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPlanFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    subscriptionPlan: {
      findFirst: (...a: unknown[]) => mockPlanFindFirst(...a),
    },
  },
}));

const mockGrantCredits = vi.fn();
vi.mock('../grant-credits-command', () => ({
  grantCreditsCommand: (...a: unknown[]) => mockGrantCredits(...a),
}));

const { grantPlanCreditsCommand } =
  await import('../grant-plan-credits-command');
const { CreditLedgerReason } = await import('@/generated/prisma/client');

beforeEach(() => {
  vi.clearAllMocks();
  mockGrantCredits.mockResolvedValue({
    balance: 500,
    ledgerPublicId: 'l-1',
    deduplicated: false,
  });
});

describe('grantPlanCreditsCommand', () => {
  it('grants plan.limits.monthlyCredits with RESET reason (no carry-over)', async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: 'plan-1',
      name: 'Pro',
      limits: { monthlyCredits: 2000 },
    });

    const result = await grantPlanCreditsCommand({
      organizationId: 'org-1',
      planName: 'Pro',
      idempotencyKey: 'plan:org-1:Pro:2026-05-22',
    });

    expect(result).toEqual({ balance: 500, granted: 2000 });
    expect(mockGrantCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        amount: 2000,
        reason: CreditLedgerReason.RESET,
        idempotencyKey: 'plan:org-1:Pro:2026-05-22',
      }),
    );
  });

  it('falls back to DEFAULT_MONTHLY_CREDITS (500) when plan has no monthlyCredits', async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: 'plan-1',
      name: 'Starter',
      limits: {},
    });

    await grantPlanCreditsCommand({
      organizationId: 'org-1',
      planName: 'Starter',
      idempotencyKey: 'k',
    });

    expect(mockGrantCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500 }),
    );
  });

  it('is a no-op when plan.limits.monthlyCredits is 0', async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: 'plan-1',
      name: 'NoCredits',
      limits: { monthlyCredits: 0 },
    });

    const result = await grantPlanCreditsCommand({
      organizationId: 'org-1',
      planName: 'NoCredits',
      idempotencyKey: 'k',
    });

    expect(result).toBeNull();
    expect(mockGrantCredits).not.toHaveBeenCalled();
  });

  it('returns null when plan is not found', async () => {
    mockPlanFindFirst.mockResolvedValue(null);

    const result = await grantPlanCreditsCommand({
      organizationId: 'org-1',
      planName: 'Ghost',
      idempotencyKey: 'k',
    });

    expect(result).toBeNull();
    expect(mockGrantCredits).not.toHaveBeenCalled();
  });
});
