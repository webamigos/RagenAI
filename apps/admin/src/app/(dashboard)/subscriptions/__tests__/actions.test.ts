import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const orgFindUnique = vi.fn();
const planFindUnique = vi.fn();
const planFindFirst = vi.fn();
const subFindFirst = vi.fn();
const subFindUnique = vi.fn();
const subCreate = vi.fn();
const subUpdate = vi.fn();
const subDelete = vi.fn();
const memberCount = vi.fn();

const stripeRetrieve = vi.fn();
const stripeUpdate = vi.fn();
const requireStripe = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/stripe', () => ({
  requireStripe: (...a: unknown[]) => requireStripe(...a),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    subscriptionPlan: {
      findUnique: (...a: unknown[]) => planFindUnique(...a),
      findFirst: (...a: unknown[]) => planFindFirst(...a),
    },
    subscription: {
      findFirst: (...a: unknown[]) => subFindFirst(...a),
      findUnique: (...a: unknown[]) => subFindUnique(...a),
      create: (...a: unknown[]) => subCreate(...a),
      update: (...a: unknown[]) => subUpdate(...a),
      delete: (...a: unknown[]) => subDelete(...a),
    },
    member: { count: (...a: unknown[]) => memberCount(...a) },
  },
}));

const {
  assignSubscriptionAction,
  removeSubscriptionAction,
  changePlanAction,
  cancelSubscriptionAction,
  reactivateSubscriptionAction,
  syncSeatsAction,
  updateSeatsAction,
} = await import('../actions');

const ORG_ID = 'org-1';
const PLAN_ID = 'plan-1';
const SUB_ID = 'sub-1';
const STRIPE_SUB_ID = 'sub_stripe_1';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  orgFindUnique.mockResolvedValue({ id: ORG_ID });
  planFindUnique.mockResolvedValue({
    id: PLAN_ID,
    name: 'Pro',
    status: 'ACTIVE',
  });
  subFindFirst.mockResolvedValue(null);
  requireStripe.mockReturnValue({
    subscriptions: {
      retrieve: (...a: unknown[]) => stripeRetrieve(...a),
      update: (...a: unknown[]) => stripeUpdate(...a),
    },
  });
  stripeRetrieve.mockResolvedValue({ items: { data: [{ id: 'si_1' }] } });
  stripeUpdate.mockResolvedValue({});
});

describe('assignSubscriptionAction', () => {
  it('creates a Stripe-less subscription for an organization that has none', async () => {
    await assignSubscriptionAction(ORG_ID, PLAN_ID);

    const { data } = subCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      plan: 'Pro',
      referenceId: ORG_ID,
      status: 'active',
      seats: 1,
      cancelAtPeriodEnd: false,
    });
    expect(data.stripeSubscriptionId).toBeUndefined();
  });

  it('updates in place when a manual subscription already exists', async () => {
    subFindFirst.mockResolvedValue({ id: SUB_ID, stripeSubscriptionId: null });

    await assignSubscriptionAction(ORG_ID, PLAN_ID);

    expect(subCreate).not.toHaveBeenCalled();
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUB_ID } }),
    );
  });

  /**
   * Overwriting a Stripe-backed row would leave the panel and Stripe
   * disagreeing until the next webhook, which would then overwrite the manual
   * grant. Refusing is the only safe outcome.
   */
  it('refuses to overwrite a Stripe-backed subscription', async () => {
    subFindFirst.mockResolvedValue({
      id: SUB_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
    });

    await expect(assignSubscriptionAction(ORG_ID, PLAN_ID)).rejects.toThrow(
      /Stripe-backed/,
    );
    expect(subUpdate).not.toHaveBeenCalled();
    expect(subCreate).not.toHaveBeenCalled();
  });

  it('rejects a blank organization ID', async () => {
    await expect(assignSubscriptionAction('  ', PLAN_ID)).rejects.toThrow(
      /Invalid organization/,
    );
  });

  it('rejects an organization that does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);
    await expect(assignSubscriptionAction(ORG_ID, PLAN_ID)).rejects.toThrow(
      /Organization not found/,
    );
  });

  it('rejects a plan that does not exist', async () => {
    planFindUnique.mockResolvedValue(null);
    await expect(assignSubscriptionAction(ORG_ID, PLAN_ID)).rejects.toThrow(
      /Plan not found or inactive/,
    );
  });

  it('rejects an archived plan', async () => {
    planFindUnique.mockResolvedValue({
      id: PLAN_ID,
      name: 'Old',
      status: 'ARCHIVED',
    });

    await expect(assignSubscriptionAction(ORG_ID, PLAN_ID)).rejects.toThrow(
      /Plan not found or inactive/,
    );
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['not a number', Number.NaN],
  ])('floors a %s seat count to 1', async (_label, seats) => {
    await assignSubscriptionAction(ORG_ID, PLAN_ID, { seats });

    expect(subCreate.mock.calls[0][0].data.seats).toBe(1);
  });

  it('truncates a fractional seat count', async () => {
    await assignSubscriptionAction(ORG_ID, PLAN_ID, { seats: 7.9 });

    expect(subCreate.mock.calls[0][0].data.seats).toBe(7);
  });

  it('honours an explicit period end', async () => {
    await assignSubscriptionAction(ORG_ID, PLAN_ID, {
      periodEndAt: '2030-01-01T00:00:00.000Z',
    });

    expect(subCreate.mock.calls[0][0].data.periodEnd).toEqual(
      new Date('2030-01-01T00:00:00.000Z'),
    );
  });

  // A manual grant with no end date should not expire next month by accident.
  it('falls back to a far-future period end when none is given', async () => {
    await assignSubscriptionAction(ORG_ID, PLAN_ID);

    const { periodEnd } = subCreate.mock.calls[0][0].data;
    expect(periodEnd.getTime()).toBeGreaterThan(
      Date.now() + 4 * 365 * 24 * 60 * 60 * 1000,
    );
  });

  it('falls back to the default period end when the given date is unparseable', async () => {
    await assignSubscriptionAction(ORG_ID, PLAN_ID, {
      periodEndAt: 'not-a-date',
    });

    const { periodEnd } = subCreate.mock.calls[0][0].data;
    expect(Number.isFinite(periodEnd.getTime())).toBe(true);
    expect(periodEnd.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('removeSubscriptionAction', () => {
  it('deletes a manual subscription', async () => {
    subFindFirst.mockResolvedValue({ id: SUB_ID, stripeSubscriptionId: null });

    await removeSubscriptionAction(ORG_ID);

    expect(subDelete).toHaveBeenCalledWith({ where: { id: SUB_ID } });
  });

  it('is a no-op when the organization has no subscription', async () => {
    subFindFirst.mockResolvedValue(null);

    await expect(removeSubscriptionAction(ORG_ID)).resolves.toBeUndefined();
    expect(subDelete).not.toHaveBeenCalled();
  });

  it('refuses to delete a Stripe-backed subscription', async () => {
    subFindFirst.mockResolvedValue({
      id: SUB_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
    });

    await expect(removeSubscriptionAction(ORG_ID)).rejects.toThrow(
      /cancel it via Stripe/,
    );
    expect(subDelete).not.toHaveBeenCalled();
  });
});

describe('Stripe-only actions', () => {
  beforeEach(() => {
    subFindUnique.mockResolvedValue({
      id: SUB_ID,
      referenceId: ORG_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
    });
    planFindFirst.mockResolvedValue({ name: 'Pro' });
  });

  it.each([
    ['changePlanAction', () => changePlanAction(SUB_ID, 'price_1')],
    ['cancelSubscriptionAction', () => cancelSubscriptionAction(SUB_ID)],
    [
      'reactivateSubscriptionAction',
      () => reactivateSubscriptionAction(SUB_ID),
    ],
    ['syncSeatsAction', () => syncSeatsAction(SUB_ID)],
    ['updateSeatsAction', () => updateSeatsAction(SUB_ID, 3)],
  ])('%s rejects a subscription that does not exist', async (_name, call) => {
    subFindUnique.mockResolvedValue(null);

    await expect(call()).rejects.toThrow(/Subscription not found/);
  });

  it.each([
    ['changePlanAction', () => changePlanAction(SUB_ID, 'price_1')],
    ['cancelSubscriptionAction', () => cancelSubscriptionAction(SUB_ID)],
    [
      'reactivateSubscriptionAction',
      () => reactivateSubscriptionAction(SUB_ID),
    ],
    ['syncSeatsAction', () => syncSeatsAction(SUB_ID)],
    ['updateSeatsAction', () => updateSeatsAction(SUB_ID, 3)],
  ])(
    '%s refuses a manual subscription, which Stripe knows nothing about',
    async (_name, call) => {
      subFindUnique.mockResolvedValue({
        id: SUB_ID,
        referenceId: ORG_ID,
        stripeSubscriptionId: null,
      });

      await expect(call()).rejects.toThrow(/No Stripe subscription ID/);
      expect(stripeUpdate).not.toHaveBeenCalled();
    },
  );

  describe('changePlanAction', () => {
    it('moves the subscription item to the new price and prorates', async () => {
      await changePlanAction(SUB_ID, 'price_2');

      expect(stripeUpdate).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        items: [{ id: 'si_1', price: 'price_2' }],
        proration_behavior: 'create_prorations',
      });
    });

    it('mirrors the new plan name locally so the panel does not wait on the webhook', async () => {
      await changePlanAction(SUB_ID, 'price_2');

      expect(subUpdate).toHaveBeenCalledWith({
        where: { id: SUB_ID },
        data: { plan: 'Pro' },
      });
    });

    // Otherwise an administrator could move an org onto a price that no plan
    // row backs, and the local `plan` name would be a guess.
    it('rejects a price with no matching active plan', async () => {
      planFindFirst.mockResolvedValue(null);

      await expect(changePlanAction(SUB_ID, 'price_x')).rejects.toThrow(
        /Invalid price ID/,
      );
      expect(stripeUpdate).not.toHaveBeenCalled();
    });

    it('rejects a Stripe subscription with no items', async () => {
      stripeRetrieve.mockResolvedValue({ items: { data: [] } });

      await expect(changePlanAction(SUB_ID, 'price_2')).rejects.toThrow(
        /no items/,
      );
    });
  });

  describe('cancel and reactivate', () => {
    it('cancels at period end rather than immediately', async () => {
      await cancelSubscriptionAction(SUB_ID);

      expect(stripeUpdate).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        cancel_at_period_end: true,
      });
      expect(subUpdate.mock.calls[0][0].data).toEqual({
        cancelAtPeriodEnd: true,
      });
    });

    it('reactivates by clearing the pending cancellation', async () => {
      await reactivateSubscriptionAction(SUB_ID);

      expect(stripeUpdate).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        cancel_at_period_end: false,
      });
      expect(subUpdate.mock.calls[0][0].data).toEqual({
        cancelAtPeriodEnd: false,
      });
    });
  });

  describe('seat management', () => {
    it('syncs the Stripe quantity to the organization member count', async () => {
      memberCount.mockResolvedValue(7);

      await syncSeatsAction(SUB_ID);

      expect(memberCount).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
      expect(stripeUpdate).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        items: [{ id: 'si_1', quantity: 7 }],
        proration_behavior: 'create_prorations',
      });
      expect(subUpdate.mock.calls[0][0].data).toEqual({ seats: 7 });
    });

    it('sets an explicit seat count', async () => {
      await updateSeatsAction(SUB_ID, 12);

      expect(stripeUpdate).toHaveBeenCalledWith(STRIPE_SUB_ID, {
        items: [{ id: 'si_1', quantity: 12 }],
        proration_behavior: 'create_prorations',
      });
    });

    it.each([[0], [-1]])('rejects a seat count of %i', async (seats) => {
      await expect(updateSeatsAction(SUB_ID, seats)).rejects.toThrow(
        /at least 1/,
      );
      expect(subFindUnique).not.toHaveBeenCalled();
    });
  });

  it('surfaces the missing-Stripe error rather than failing silently', async () => {
    requireStripe.mockImplementation(() => {
      throw new Error('Stripe is not configured on this deployment');
    });

    await expect(cancelSubscriptionAction(SUB_ID)).rejects.toThrow(
      /not configured/,
    );
  });
});

describe('the platform-admin guard', () => {
  it.each([
    [
      'assignSubscriptionAction',
      () => assignSubscriptionAction(ORG_ID, PLAN_ID),
    ],
    ['removeSubscriptionAction', () => removeSubscriptionAction(ORG_ID)],
    ['changePlanAction', () => changePlanAction(SUB_ID, 'price_1')],
    ['cancelSubscriptionAction', () => cancelSubscriptionAction(SUB_ID)],
    [
      'reactivateSubscriptionAction',
      () => reactivateSubscriptionAction(SUB_ID),
    ],
    ['syncSeatsAction', () => syncSeatsAction(SUB_ID)],
    ['updateSeatsAction', () => updateSeatsAction(SUB_ID, 2)],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(subCreate).not.toHaveBeenCalled();
      expect(subUpdate).not.toHaveBeenCalled();
      expect(subDelete).not.toHaveBeenCalled();
      expect(stripeUpdate).not.toHaveBeenCalled();
    },
  );
});
