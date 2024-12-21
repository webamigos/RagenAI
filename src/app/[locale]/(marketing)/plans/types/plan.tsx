import Stripe from 'stripe';

export type StripePlan = Stripe.Price & {
  product: Stripe.Product;
};
