'use server';

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { revalidatePath } from 'next/cache';

/**
 * Create or replace a Stripe-less subscription row for an organization.
 *
 * Use this when granting a partner / internal org a paid plan without going
 * through Stripe checkout. Stripe webhooks won't touch the resulting row.
 * If the org already has a subscription, it is updated in place.
 */
export async function assignSubscriptionAction(
  orgId: string,
  planId: string,
  options: { seats?: number; periodEndAt?: string | null } = {},
) {
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) {
    throw new Error('Organization not found');
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, status: true },
  });
  if (!plan || plan.status !== 'ACTIVE') {
    throw new Error('Plan not found or inactive');
  }

  const seatsRaw = Number(options.seats);
  const seats =
    Number.isFinite(seatsRaw) && seatsRaw >= 1 ? Math.floor(seatsRaw) : 1;
  const defaultPeriodEnd = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);
  let periodEnd = defaultPeriodEnd;
  if (options.periodEndAt) {
    const candidate = new Date(options.periodEndAt);
    if (Number.isFinite(candidate.getTime())) {
      periodEnd = candidate;
    }
  }

  const existing = await prisma.subscription.findFirst({
    where: { referenceId: orgId },
    select: { id: true, stripeSubscriptionId: true },
  });

  if (existing?.stripeSubscriptionId) {
    throw new Error(
      'This org has a Stripe-backed subscription — cancel it before assigning a manual plan',
    );
  }

  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        plan: plan.name,
        status: 'active',
        seats,
        periodStart: new Date(),
        periodEnd,
        cancelAtPeriodEnd: false,
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        id: randomUUID(),
        plan: plan.name,
        referenceId: orgId,
        status: 'active',
        seats,
        periodStart: new Date(),
        periodEnd,
        cancelAtPeriodEnd: false,
      },
    });
  }

  // Grant plan credits with RESET semantics (no carry-over). Mirrors
  // grantPlanCreditsCommand in the main app — duplicated here because the
  // admin app doesn't share path aliases. Idempotency key includes
  // periodStart so re-assigning the same plan tomorrow grants a fresh
  // period's worth.
  await grantPlanCreditsForOrg(orgId, plan.id, plan.name);

  revalidatePath('/subscriptions');
  revalidatePath(`/organizations/${orgId}`);
}

const DEFAULT_MONTHLY_CREDITS = 500;

function readMonthlyCredits(limits: unknown): number {
  if (limits && typeof limits === 'object' && !Array.isArray(limits)) {
    const value = (limits as Record<string, unknown>).monthlyCredits;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return DEFAULT_MONTHLY_CREDITS;
}

async function grantPlanCreditsForOrg(
  orgId: string,
  planId: string,
  planName: string,
): Promise<void> {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: { limits: true },
  });
  if (!plan) {
    return;
  }
  const monthlyCredits = readMonthlyCredits(plan.limits);
  if (monthlyCredits === 0) {
    return;
  }

  const idempotencyKey = `plan:${orgId}:${planName}:${new Date().toISOString().slice(0, 10)}`;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.creditLedgerEntry.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: orgId,
          idempotencyKey,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    await tx.$executeRaw`
      INSERT INTO "org_credit_balances" ("organization_id", "balance", "lifetime_granted", "lifetime_spent", "updated_at")
      VALUES (${orgId}, 0, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO NOTHING
    `;
    const locked = await tx.$queryRaw<
      { balance: number; lifetime_granted: number }[]
    >`
      SELECT "balance", "lifetime_granted"
      FROM "org_credit_balances"
      WHERE "organization_id" = ${orgId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) {
      return;
    }
    const newBalance = monthlyCredits;
    const delta = newBalance - current.balance;
    const grantedAddition = Math.max(0, delta);

    await tx.orgCreditBalance.update({
      where: { organizationId: orgId },
      data: {
        balance: newBalance,
        lifetimeGranted: current.lifetime_granted + grantedAddition,
      },
    });
    await tx.creditLedgerEntry.create({
      data: {
        organizationId: orgId,
        delta,
        balanceAfter: newBalance,
        reason: 'RESET',
        idempotencyKey,
        note: `Plan grant (admin): ${planName}`,
        metadata: { planName, planId },
      },
    });
  });
}

export async function removeSubscriptionAction(orgId: string) {
  const existing = await prisma.subscription.findFirst({
    where: { referenceId: orgId },
    select: { id: true, stripeSubscriptionId: true },
  });
  if (!existing) {
    return;
  }
  if (existing.stripeSubscriptionId) {
    throw new Error(
      'This org has a Stripe-backed subscription — cancel it via Stripe, not here',
    );
  }
  await prisma.subscription.delete({ where: { id: existing.id } });
  revalidatePath('/subscriptions');
  revalidatePath(`/organizations/${orgId}`);
}

export async function changePlanAction(
  subscriptionId: string,
  newPriceId: string,
) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  if (!subscription.stripeSubscriptionId) {
    throw new Error('No Stripe subscription ID — cannot update via Stripe');
  }

  // Get current Stripe subscription to find the item ID
  const stripeSub = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
  );

  if (!stripeSub.items.data.length) {
    throw new Error('Stripe subscription has no items');
  }

  const itemId = stripeSub.items.data[0].id;

  // Validate the new price exists as an active plan
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { priceId: newPriceId, status: 'ACTIVE' },
    select: { name: true },
  });

  if (!plan) {
    throw new Error('Invalid price ID — no active plan found');
  }

  // Update the subscription item to the new price
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: [
      {
        id: itemId,
        price: newPriceId,
      },
    ],
    proration_behavior: 'create_prorations',
  });

  // Update local plan name immediately (webhook will also update)
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { plan: plan.name },
  });

  revalidatePath('/subscriptions');
}

export async function cancelSubscriptionAction(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  if (!subscription.stripeSubscriptionId) {
    throw new Error('No Stripe subscription ID');
  }

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { cancelAtPeriodEnd: true },
  });

  revalidatePath('/subscriptions');
}

export async function reactivateSubscriptionAction(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  if (!subscription.stripeSubscriptionId) {
    throw new Error('No Stripe subscription ID');
  }

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { cancelAtPeriodEnd: false },
  });

  revalidatePath('/subscriptions');
}

export async function syncSeatsAction(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  if (!subscription.stripeSubscriptionId) {
    throw new Error('No Stripe subscription ID');
  }

  const memberCount = await prisma.member.count({
    where: { organizationId: subscription.referenceId },
  });

  const stripeSub = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
  );

  if (!stripeSub.items.data.length) {
    throw new Error('Stripe subscription has no items');
  }

  const item = stripeSub.items.data[0];

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: [{ id: item.id, quantity: memberCount }],
    proration_behavior: 'create_prorations',
  });

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { seats: memberCount },
  });

  revalidatePath('/subscriptions');
}

export async function updateSeatsAction(subscriptionId: string, seats: number) {
  if (seats < 1) {
    throw new Error('Seats must be at least 1');
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  if (!subscription.stripeSubscriptionId) {
    throw new Error('No Stripe subscription ID');
  }

  const stripeSub = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
  );

  if (!stripeSub.items.data.length) {
    throw new Error('Stripe subscription has no items');
  }

  const item = stripeSub.items.data[0];

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: [{ id: item.id, quantity: seats }],
    proration_behavior: 'create_prorations',
  });

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { seats },
  });

  revalidatePath('/subscriptions');
}
