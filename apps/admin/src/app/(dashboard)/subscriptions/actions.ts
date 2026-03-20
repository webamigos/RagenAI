'use server';

import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { revalidatePath } from 'next/cache';

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
