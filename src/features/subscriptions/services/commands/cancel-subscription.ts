'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import { getStripe } from '@/libs/payments/stripe';

export async function cancelSubscriptionCommand(
  stripeSubscriptionId: string,
): Promise<OperationResult<{ canceledAt: Date | null }>> {
  try {
    const stripeClient = getStripe();

    let canceledAt: Date | null = null;

    if (stripeClient) {
      const result = await stripeClient.subscriptions.update(
        stripeSubscriptionId,
        { cancel_at_period_end: true },
      );
      canceledAt = result.canceled_at
        ? new Date(result.canceled_at * 1000)
        : null;
    }

    // Also update our local record
    await db.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { cancelAtPeriodEnd: true },
    });

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
