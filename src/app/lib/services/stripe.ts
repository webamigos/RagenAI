import { stripe } from '@/libs/payments/stripe';
import Stripe from 'stripe';

export type StripePlan = Stripe.Price & {
  product: Stripe.Product;
};

type CreateCheckoutParams = {
  priceId: string;
  orgId: string;
  origin: string;
  email?: string;
};

export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.cancel(subscriptionId);
}

export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function fetchStripePlans(): Promise<StripePlan[]> {
  const stripePlans = (await stripe.prices.list({
    active: true,
    expand: ['data.product'],
  })) as Stripe.Response<Stripe.ApiList<StripePlan>>;

  return stripePlans.data;
}

export async function createCheckout({
  priceId,
  orgId,
  origin,
  email,
}: CreateCheckoutParams): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
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
}

export async function getInvoiceUrl(invoiceId: string): Promise<string> {
  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ['payment_intent'],
  });

  if (!invoice.hosted_invoice_url) {
    throw new Error('Invoice URL not found');
  }

  return invoice.hosted_invoice_url;
}

export async function retrieveCheckoutSessionDetails(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'payment_intent', 'subscription'],
  });
}
