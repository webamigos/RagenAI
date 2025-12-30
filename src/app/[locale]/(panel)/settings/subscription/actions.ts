'use server';

import Stripe from 'stripe';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import db from '@ragenai/prisma-client';
import { cancelSubscriptionAtPeriodEnd } from '@/app/lib/services/stripe';
import type { SubscriptionDetails } from './types';
import { activateFreePlan } from '@/app/lib/services/plan';

export async function getSubscriptionData(): Promise<SubscriptionDetails | null> {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    return null;
  }

  const organization = await db.internalOrganization.findFirst({
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
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId || !subscriptionId) {
    return null;
  }

  return cancelSubscriptionAtPeriodEnd(subscriptionId);
}

export async function activateInternalFreePlan() {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    throw new Error('Cannot activate free plan, no organization id found');
  }

  await activateFreePlan(orgId);
}
