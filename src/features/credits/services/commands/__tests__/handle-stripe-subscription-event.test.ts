import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const mockGrantPlan = vi.fn();
vi.mock('../grant-plan-credits-command', () => ({
  grantPlanCreditsCommand: (...a: unknown[]) => mockGrantPlan(...a),
}));

const { handleStripeSubscriptionEvent } =
  await import('../handle-stripe-subscription-event');

beforeEach(() => {
  vi.clearAllMocks();
  mockGrantPlan.mockResolvedValue({ balance: 500, granted: 500 });
});

describe('handleStripeSubscriptionEvent', () => {
  it('uses the same key shape as ensurePlanGrant so webhook + lazy renewal dedupe', async () => {
    await handleStripeSubscriptionEvent({
      organizationId: 'org-1',
      planName: 'Pro',
      stripeSubscriptionId: 'sub_abc',
      periodStart: new Date('2026-05-15T00:00:00Z'),
    });

    expect(mockGrantPlan).toHaveBeenCalledWith({
      organizationId: 'org-1',
      planName: 'Pro',
      idempotencyKey: 'plan:org-1:Pro:2026-05-15',
    });
  });

  it('uses the same key for repeat deliveries within the same period (Stripe retries safe)', async () => {
    const args = {
      organizationId: 'org-1',
      planName: 'Pro',
      stripeSubscriptionId: 'sub_abc',
      periodStart: new Date('2026-05-15T00:00:00Z'),
    };
    await handleStripeSubscriptionEvent(args);
    await handleStripeSubscriptionEvent(args);

    expect(mockGrantPlan).toHaveBeenCalledTimes(2);
    expect(mockGrantPlan.mock.calls[0][0].idempotencyKey).toBe(
      mockGrantPlan.mock.calls[1][0].idempotencyKey,
    );
    // Dedup is enforced inside grantCreditsCommand via the DB unique index;
    // this helper just passes the stable key.
  });

  it('produces a different key after period rollover (renewal)', async () => {
    await handleStripeSubscriptionEvent({
      organizationId: 'org-1',
      planName: 'Pro',
      stripeSubscriptionId: 'sub_abc',
      periodStart: new Date('2026-05-15T00:00:00Z'),
    });
    await handleStripeSubscriptionEvent({
      organizationId: 'org-1',
      planName: 'Pro',
      stripeSubscriptionId: 'sub_abc',
      periodStart: new Date('2026-06-15T00:00:00Z'),
    });

    const keyMay = mockGrantPlan.mock.calls[0][0].idempotencyKey;
    const keyJun = mockGrantPlan.mock.calls[1][0].idempotencyKey;
    expect(keyMay).not.toBe(keyJun);
    expect(keyMay).toBe('plan:org-1:Pro:2026-05-15');
    expect(keyJun).toBe('plan:org-1:Pro:2026-06-15');
  });

  it('falls back to today when periodStart is missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));

    await handleStripeSubscriptionEvent({
      organizationId: 'org-1',
      planName: 'Pro',
      stripeSubscriptionId: 'sub_abc',
      periodStart: null,
    });

    expect(mockGrantPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'plan:org-1:Pro:2026-05-22',
      }),
    );
    vi.useRealTimers();
  });

  it('is a no-op when organizationId or planName is missing', async () => {
    await handleStripeSubscriptionEvent({
      organizationId: '',
      planName: 'Pro',
      stripeSubscriptionId: 'sub_abc',
      periodStart: new Date(),
    });
    await handleStripeSubscriptionEvent({
      organizationId: 'org-1',
      planName: '',
      stripeSubscriptionId: 'sub_abc',
      periodStart: new Date(),
    });
    expect(mockGrantPlan).not.toHaveBeenCalled();
  });

  it('swallows errors so webhook delivery is never blocked', async () => {
    mockGrantPlan.mockRejectedValue(new Error('db down'));
    await expect(
      handleStripeSubscriptionEvent({
        organizationId: 'org-1',
        planName: 'Pro',
        stripeSubscriptionId: 'sub_abc',
        periodStart: new Date('2026-05-15T00:00:00Z'),
      }),
    ).resolves.toBeUndefined();
  });
});
