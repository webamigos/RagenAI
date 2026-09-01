'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import type { SubscriptionPlan } from '@/generated/prisma/client';

export async function getAvailablePlansQuery(): Promise<
  OperationResult<SubscriptionPlan[]>
> {
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: { status: 'ACTIVE' },
    });

    return { success: true, data: plans };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get available plans',
    };
  }
}
