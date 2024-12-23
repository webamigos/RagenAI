'use server';

import { logger } from '@/app/lib/utils/logger';
import { getInvoiceUrl as getStripeInvoiceUrl } from '@/app/lib/services/stripe';

export async function getInvoiceUrl(invoiceId: string): Promise<string> {
  if (!invoiceId) {
    throw new Error('Invoice ID is required');
  }

  try {
    return await getStripeInvoiceUrl(invoiceId);
  } catch (err) {
    logger.error({ err }, 'Error retrieving invoice');
    throw new Error('Failed to retrieve invoice');
  }
}
