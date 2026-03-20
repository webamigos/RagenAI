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

  // The webhook will handle updating the local DB, but we can update plan name immediately
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { priceId: newPriceId },
    select: { name: true },
  });

  if (plan) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { plan: plan.name },
    });
  }

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
