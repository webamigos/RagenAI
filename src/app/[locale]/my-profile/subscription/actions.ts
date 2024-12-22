'use server';

import { auth } from '@clerk/nextjs/server';

import db from '@ragenai/prisma-client';

import type { SubscriptionDetails } from './types';
import { stripe } from '@/libs/payments/stripe';
import Stripe from 'stripe';

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
): Promise<Stripe.Response<Stripe.Subscription> | null> {
  const { orgId } = auth();

  if (!orgId || !subscriptionId) {
    return null;
  }

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}
