import type { Stripe } from 'stripe';
import { getTranslations } from 'next-intl/server';
import { getStripe } from '@/libs/payments/stripe';
import { getInvoiceUrl } from '../actions';
import { CheckoutSuccess } from '../../components/CheckoutSuccess';
import type { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('checkout-success.title') };
}

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id: string }>;
}): Promise<JSX.Element> {
  const { session_id } = await searchParams;
  if (!session_id) {
    return <></>;
  }

  const stripeClient = getStripe();
  if (!stripeClient) {
    return <></>;
  }

  const checkoutSession = await stripeClient.checkout.sessions.retrieve(
    session_id,
    {
      expand: ['line_items', 'payment_intent', 'subscription'],
    },
  );

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
