'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import { stripe } from '@/libs/payments/stripe';

export async function cancelSubscriptionCommand(
  stripeSubscriptionId: string
): Promise<OperationResult<{ canceledAt: Date | null }>> {
  try {
    const result = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Also update our local record
    await db.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { cancelAtPeriodEnd: true },
    });

    const canceledAt = result.canceled_at
      ? new Date(result.canceled_at * 1000)
      : null;

    return { success: true, data: { canceledAt } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to cancel subscription',
    };
  }
}
