import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const productsList = vi.fn();
const requireStripe = vi.fn();
const planFindUnique = vi.fn();
const planCreate = vi.fn();
const planUpdate = vi.fn();
const planUpdateMany = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

// The helper has its own tests in src/lib/__tests__/audit.test.ts; here we only
// care that the action calls it, and with what.
const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/stripe', () => ({
  requireStripe: (...a: unknown[]) => requireStripe(...a),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    subscriptionPlan: {
      findUnique: (...a: unknown[]) => planFindUnique(...a),
      create: (...a: unknown[]) => planCreate(...a),
      update: (...a: unknown[]) => planUpdate(...a),
      updateMany: (...a: unknown[]) => planUpdateMany(...a),
    },
  },
}));

const { syncPlansFromStripeAction } = await import('../actions');

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod_1',
    name: 'Pro',
    default_price: { id: 'price_1' },
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  planFindUnique.mockResolvedValue(null);
  requireStripe.mockReturnValue({
    products: { list: (...a: unknown[]) => productsList(...a) },
  });
  productsList.mockResolvedValue({ data: [] });
});

describe('syncPlansFromStripeAction', () => {
  it('asks Stripe only for active products, with the default price expanded', async () => {
    await syncPlansFromStripeAction();

    expect(productsList).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        expand: ['data.default_price'],
      }),
    );
  });

  it('creates a plan row for a product it has not seen', async () => {
    productsList.mockResolvedValue({ data: [product()] });

    await expect(syncPlansFromStripeAction()).resolves.toEqual({ synced: 1 });

    expect(planCreate.mock.calls[0][0].data).toMatchObject({
      name: 'Pro',
      priceId: 'price_1',
      productId: 'prod_1',
      type: 'STRIPE',
      status: 'ACTIVE',
    });
  });

  it('updates a plan row it already has, keyed by product ID', async () => {
    productsList.mockResolvedValue({ data: [product()] });
    planFindUnique.mockResolvedValue({ id: 'plan-1' });

    await syncPlansFromStripeAction();

    expect(planCreate).not.toHaveBeenCalled();
    expect(planUpdate.mock.calls[0][0].where).toEqual({ productId: 'prod_1' });
  });

  it('reads limits and features out of Stripe product metadata', async () => {
    productsList.mockResolvedValue({
      data: [
        product({
          metadata: {
            limits: '{"maxMembers":10}',
            features: '{"apiAccess":true}',
          },
        }),
      ],
    });

    await syncPlansFromStripeAction();

    const { data } = planCreate.mock.calls[0][0];
    expect(data.limits).toEqual({ maxMembers: 10 });
    expect(data.features).toEqual({ apiAccess: true });
  });

  /**
   * The metadata is typed by whoever edits the Stripe dashboard. One bad
   * product must not abort the sync for every other plan.
   */
  it('still syncs a product whose metadata JSON is malformed', async () => {
    productsList.mockResolvedValue({
      data: [product({ metadata: { limits: '{oops', features: '{oops' } })],
    });

    await expect(syncPlansFromStripeAction()).resolves.toEqual({ synced: 1 });
    expect(planCreate.mock.calls[0][0].data.limits).toEqual({});
  });

  // No default price means nothing to charge, so there is no usable plan.
  it('skips a product with no default price and does not count it', async () => {
    productsList.mockResolvedValue({
      data: [product({ default_price: null })],
    });

    await expect(syncPlansFromStripeAction()).resolves.toEqual({ synced: 0 });
    expect(planCreate).not.toHaveBeenCalled();
  });

  it('skips a product whose default price was not expanded', async () => {
    productsList.mockResolvedValue({
      data: [product({ default_price: 'price_1' })],
    });

    await expect(syncPlansFromStripeAction()).resolves.toEqual({ synced: 0 });
    expect(planCreate).not.toHaveBeenCalled();
  });

  it('archives Stripe plans that are no longer active in Stripe', async () => {
    productsList.mockResolvedValue({ data: [product()] });

    await syncPlansFromStripeAction();

    expect(planUpdateMany).toHaveBeenCalledWith({
      where: {
        type: 'STRIPE',
        productId: { notIn: ['prod_1'] },
        status: 'ACTIVE',
      },
      data: { status: 'ARCHIVED' },
    });
  });

  /**
   * The archive step is scoped to `type: 'STRIPE'`, so a manually created
   * plan an administrator granted by hand is never archived by a sync.
   */
  it('never archives a manually created plan', async () => {
    productsList.mockResolvedValue({ data: [product()] });

    await syncPlansFromStripeAction();

    expect(planUpdateMany.mock.calls[0][0].where.type).toBe('STRIPE');
  });

  /**
   * Guards a footgun: an empty product list means "Stripe returned nothing",
   * which would otherwise archive every plan in the database.
   */
  it('archives nothing when Stripe returns no products', async () => {
    productsList.mockResolvedValue({ data: [] });

    await expect(syncPlansFromStripeAction()).resolves.toEqual({ synced: 0 });
    expect(planUpdateMany).not.toHaveBeenCalled();
  });

  it('surfaces a missing Stripe configuration', async () => {
    requireStripe.mockImplementation(() => {
      throw new Error('Stripe is not configured on this deployment');
    });

    await expect(syncPlansFromStripeAction()).rejects.toThrow(/not configured/);
  });

  it('refuses a caller that is not a platform administrator', async () => {
    requireAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(syncPlansFromStripeAction()).rejects.toThrow(/Forbidden/);
    expect(productsList).not.toHaveBeenCalled();
  });
});
