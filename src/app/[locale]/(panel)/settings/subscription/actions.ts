'use server';

import Stripe from 'stripe';
import { auth } from '@clerk/nextjs/server';
import db from '@ragenai/prisma-client';
import { cancelSubscriptionAtPeriodEnd } from '@/app/lib/services/stripe';
import type { SubscriptionDetails } from './types';
import { activateFreePlan } from '@/app/lib/services/plan';

export async function getSubscriptionData(): Promise<SubscriptionDetails | null> {
  const { orgId } = auth();

  if (!orgId) {
    return null;
  }

  const organization = await db.organization.findFirst({
    where: {
      provider_id: orgId,
    },
    select: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  return organization?.subscription ?? null;
}

export async function cancelSubscription(
  subscriptionId: string | null
): Promise<Stripe.Subscription | null> {
  const { orgId } = auth();

  if (!orgId || !subscriptionId) {
    return null;
  }

  return cancelSubscriptionAtPeriodEnd(subscriptionId);
}

export async function activateInternalFreePlan() {
  const { orgId } = auth();

  if (!orgId) {
    throw new Error('Cannot activate free plan, no organization id found');
  }

  await activateFreePlan(orgId);
}
