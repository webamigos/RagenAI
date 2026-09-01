'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';
import type { Subscription } from '@/generated/prisma/client';
import { FREE_PLAN_NAME } from '@/app/config';

export async function activateFreePlanCommand(
  referenceId: string
): Promise<OperationResult<Subscription>> {
  try {
    const freePlan = await db.subscriptionPlan.findFirst({
      where: { name: FREE_PLAN_NAME, status: 'ACTIVE' },
    });

    if (!freePlan) {
      return { success: false, error: 'Free plan not found' };
    }

    const existing = await db.subscription.findFirst({
      where: { referenceId },
    });

    if (existing) {
      const updated = await db.subscription.update({
        where: { id: existing.id },
        data: {
          plan: freePlan.name,
          status: 'active',
          cancelAtPeriodEnd: false,
          trialEnd: null,
          trialStart: null,
          periodStart: new Date(),
          periodEnd: new Date(new Date().setFullYear(2099, 11, 31)),
        },
      });
      return { success: true, data: updated };
    }

    const created = await db.subscription.create({
      data: {
        id: crypto.randomUUID(),
        plan: freePlan.name,
        referenceId,
        status: 'active',
        periodStart: new Date(),
        periodEnd: new Date(new Date().setFullYear(2099, 11, 31)),
      },
    });

    return { success: true, data: created };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to activate free plan',
    };
  }
}
