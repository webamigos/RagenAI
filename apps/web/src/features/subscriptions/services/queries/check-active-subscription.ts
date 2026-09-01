'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';

export async function checkActiveSubscriptionQuery(
  referenceId: string
): Promise<OperationResult<boolean>> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        referenceId,
        status: 'active',
      },
    });

    return { success: true, data: !!subscription };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to check subscription status',
    };
  }
}
