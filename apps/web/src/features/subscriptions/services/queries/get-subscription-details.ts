'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import type { Subscription, SubscriptionPlan } from '@/generated/prisma/client';

export type SubscriptionWithPlan = Subscription & {
  subscriptionPlan: SubscriptionPlan | null;
};

export async function getSubscriptionDetailsQuery(
  referenceId: string
): Promise<OperationResult<SubscriptionWithPlan>> {
  try {
    const subscription = await db.subscription.findFirst({
      where: { referenceId },
    });

    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    const subscriptionPlan = await db.subscriptionPlan.findFirst({
      where: { name: subscription.plan },
    });

    return {
      success: true,
      data: { ...subscription, subscriptionPlan },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get subscription details',
    };
  }
}
