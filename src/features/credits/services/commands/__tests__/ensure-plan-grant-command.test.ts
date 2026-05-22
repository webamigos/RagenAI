import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const mockSubscriptionFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    subscription: {
      findFirst: (...a: unknown[]) => mockSubscriptionFindFirst(...a),
    },
  },
}));

const mockGrantPlan = vi.fn();
vi.mock('../grant-plan-credits-command', () => ({
  grantPlanCreditsCommand: (...a: unknown[]) => mockGrantPlan(...a),
}));

const { ensurePlanGrantCommand } = await import('../ensure-plan-grant-command');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mockGrantPlan.mockResolvedValue({ balance: 500, granted: 500 });
});

describe('ensurePlanGrantCommand', () => {
  it('is a no-op when org has no active subscription', async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);
    await ensurePlanGrantCommand('org-1');
    expect(mockGrantPlan).not.toHaveBeenCalled();
  });

  it('grants with current monthly anchor as part of idempotency key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'));
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      periodStart: new Date('2026-01-15T00:00:00Z'),
      periodEnd: new Date('2027-01-15T00:00:00Z'),
    });

    await ensurePlanGrantCommand('org-1');

    // Current anchor on 2026-03-20 with start day=15 → 2026-03-15
    expect(mockGrantPlan).toHaveBeenCalledWith({
      organizationId: 'org-1',
      planName: 'Pro',
      idempotencyKey: 'plan:org-1:Pro:2026-03-15',
    });
  });

  it('uses the same idempotency key throughout one period (multiple calls = one effective grant)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T00:00:00Z'));
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      periodStart: new Date('2026-01-15T00:00:00Z'),
      periodEnd: new Date('2027-01-15T00:00:00Z'),
    });

    await ensurePlanGrantCommand('org-1');
    await ensurePlanGrantCommand('org-1');

    expect(mockGrantPlan).toHaveBeenCalledTimes(2);
    expect(mockGrantPlan.mock.calls[0][0].idempotencyKey).toBe(
      mockGrantPlan.mock.calls[1][0].idempotencyKey,
    );
    // Deduplication is enforced inside grantCreditsCommand via the unique
    // (org, idempotencyKey) index — this command just relies on it.
  });

  it('produces a different idempotency key after period rollover', async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      periodStart: new Date('2026-01-15T00:00:00Z'),
      periodEnd: new Date('2027-01-15T00:00:00Z'),
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00Z'));
    await ensurePlanGrantCommand('org-1');
    const keyMonth1 = mockGrantPlan.mock.calls[0][0].idempotencyKey;

    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'));
    await ensurePlanGrantCommand('org-1');
    const keyMonth2 = mockGrantPlan.mock.calls[1][0].idempotencyKey;

    expect(keyMonth1).not.toBe(keyMonth2);
    expect(keyMonth1).toBe('plan:org-1:Pro:2026-01-15');
    expect(keyMonth2).toBe('plan:org-1:Pro:2026-03-15');
  });

  it('does not grant past periodEnd (expired subscription)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      periodStart: new Date('2026-01-15T00:00:00Z'),
      periodEnd: new Date('2026-03-15T00:00:00Z'),
    });

    await ensurePlanGrantCommand('org-1');
    expect(mockGrantPlan).not.toHaveBeenCalled();
  });

  it('swallows errors (renewal failures must not break callers)', async () => {
    mockSubscriptionFindFirst.mockRejectedValue(new Error('db down'));
    await expect(ensurePlanGrantCommand('org-1')).resolves.toBeUndefined();
  });
});
