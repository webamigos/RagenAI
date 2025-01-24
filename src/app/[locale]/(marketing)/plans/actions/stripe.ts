'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { logger } from '@/app/lib/utils/logger';
import { createCheckout } from '@/app/lib/services/stripe';
import { headers } from 'next/headers';
import {
  setSentryClerkContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { checkIfStripeSubscriptionIsActive } from './plans';

export async function createCheckoutSession(priceId: string) {
  try {
    setSentryServiceTag('stripe:createCheckoutSession');

    if (!priceId?.trim()) {
      throw new Error('Price ID is required');
    }

    const { orgId, userId, sessionId } = auth();
    if (!orgId) {
      throw new Error(
        'Cannot create checkout session, no organization id found'
      );
    }

    setSentryClerkContext({ orgId, userId, sessionId });

    const subscriptionIsActive = await checkIfStripeSubscriptionIsActive();

    if (subscriptionIsActive) {
      throw new Error('Cannot create checkout session, subscription is active');
    }

    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses[0].emailAddress;
    const origin: string = headers().get('origin') as string;

    const checkoutSession = await createCheckout({
      priceId,
      orgId,
      email,
      origin,
    });

    return {
      client_secret: checkoutSession.client_secret,
      url: checkoutSession.url,
    };
  } catch (error: any) {
    logger.error({ err: error }, 'Error creating checkout session');
    throw new Error(`Failed to create checkout ${error.message}`);
  }
}
