import type { Stripe } from 'stripe';
import { stripe } from '@/libs/payments/stripe';
import { getInvoiceUrl } from '../actions';
import { CheckoutSuccess } from '../../components/CheckoutSuccess';

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id: string }>;
}): Promise<JSX.Element> {
  const { session_id } = await searchParams;
  if (!session_id) {
    return <></>;
  }

  const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, {
    expand: ['line_items', 'payment_intent', 'subscription'],
  });

  const subscription = checkoutSession.subscription as Stripe.Subscription;
  const lineItems = checkoutSession.line_items?.data[0];

  // In Stripe SDK v18 current_period_end was removed from Subscription.
  // Compute next payment from billing_cycle_anchor + 1 month as fallback.
  const anchorTimestamp = subscription.billing_cycle_anchor;
  const nextPaymentDate = anchorTimestamp
    ? new Date(anchorTimestamp * 1000)
    : new Date();

  const invoiceUrl = checkoutSession.invoice
    ? await getInvoiceUrl(checkoutSession.invoice as string)
    : null;

  return (
    <CheckoutSuccess
      lineItem={lineItems}
      nextPaymentDate={nextPaymentDate}
      status={subscription.status}
      invoiceUrl={invoiceUrl}
    />
  );
}
