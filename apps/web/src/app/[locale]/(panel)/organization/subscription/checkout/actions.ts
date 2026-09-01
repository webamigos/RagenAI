'use server';

import { logger } from '@/app/lib/utils/logger';
import { getStripe } from '@/libs/payments/stripe';

export async function getInvoiceUrl(invoiceId: string): Promise<string> {
  if (!invoiceId) {
    throw new Error('Invoice ID is required');
  }

  const stripeClient = getStripe();
  if (!stripeClient) {
    throw new Error('Stripe is not configured');
  }

  try {
    const invoice = await stripeClient.invoices.retrieve(invoiceId, {
      expand: ['payment_intent'],
    });

    if (!invoice.hosted_invoice_url) {
      throw new Error('Invoice URL not found');
    }

    return invoice.hosted_invoice_url;
  } catch (err) {
    logger.error({ err }, 'Error retrieving invoice');
    throw new Error('Failed to retrieve invoice');
  }
}
