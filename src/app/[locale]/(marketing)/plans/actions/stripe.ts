'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { logger } from '@/app/lib/utils/logger';
import { stripe } from '@/libs/payments/stripe';
import { headers } from 'next/headers';
import {
  setSentryClerkContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';

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

    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses[0].emailAddress;

    const origin: string = headers().get('origin') as string;

    const checkoutSession = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/my-profile/subscription/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plans`,
      payment_method_types: ['card'],
      client_reference_id: orgId,
      customer_email: email ?? undefined,
      tax_id_collection: { enabled: true },
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
