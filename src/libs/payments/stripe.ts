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

/**
 * @deprecated Use getStripe() instead. Kept for backwards compatibility.
 * Throws if STRIPE_SECRET_KEY is not set.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe();
    if (!client) {
      throw new Error(
        'Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.',
      );
    }
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
