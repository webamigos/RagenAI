import 'server-only';

import Stripe from 'stripe';

// CONFIGURATION options: https://github.com/stripe/stripe-node#configuration
export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || 'sk_placeholder_for_build',
  {},
);
