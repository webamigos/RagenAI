import type { Stripe } from 'stripe';
import { retrieveCheckoutSessionDetails } from '@/app/lib/services/stripe';
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

  const checkoutSession = await retrieveCheckoutSessionDetails(session_id);

  const subscription = checkoutSession.subscription as Stripe.Subscription;
  const lineItems = checkoutSession.line_items?.data[0];

  const nextPaymentDate = new Date(subscription.current_period_end * 1000);

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
