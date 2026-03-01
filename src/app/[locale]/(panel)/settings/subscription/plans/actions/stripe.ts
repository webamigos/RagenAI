'use server';

import {
  getCurrentUser,
  getOrgIdFromAuthOrThrow,
} from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { stripe } from '@/libs/payments/stripe';
import { headers } from 'next/headers';
import { checkIfStripeSubscriptionIsActive } from './plans';

export async function createCheckoutSession(priceId: string) {
  try {
    if (!priceId?.trim()) {
      throw new Error('Price ID is required');
    }

    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      throw new Error(
        'Cannot create checkout session, no organization id found'
      );
    }

    const user = await getCurrentUser();
    if (!user || !user.email) {
      throw new Error('Cannot create checkout session, user not found');
    }

    const subscriptionIsActive = await checkIfStripeSubscriptionIsActive();

    if (subscriptionIsActive) {
      throw new Error('Cannot create checkout session, subscription is active');
    }

    const email = user.email;
    const origin: string = (await headers()).get('origin') as string;

    const checkoutSession = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/settings/subscription/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/subscription/plans`,
      payment_method_types: ['card'],
      client_reference_id: orgId,
      customer_email: email,
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
