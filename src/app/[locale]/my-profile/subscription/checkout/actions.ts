'use server';

import { logger } from '@/app/lib/utils/logger';
import { stripe } from '@/libs/payments/stripe';

export async function getInvoiceUrl(invoiceId: string): Promise<string> {
  if (!invoiceId) {
    throw new Error('Invoice ID is required');
  }

  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
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
