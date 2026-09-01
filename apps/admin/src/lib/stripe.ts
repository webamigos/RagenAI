import 'server-only';

import Stripe from 'stripe';

export function isStripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error(
      'Stripe is not configured on this deployment (STRIPE_SECRET_KEY unset)',
    );
  }
  return stripe;
}
