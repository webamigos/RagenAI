import db from '@ragenai/prisma-client';
import { getBalanceQuery } from './get-balance-query';
import { currentPeriodAnchor } from '../../utils/period-anchor';
import { DEFAULT_MONTHLY_CREDITS } from '../../constants/credit-costs';

export type CreditsSummary = {
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  /** Credits granted each billing period, if the org has an active plan. */
  planMonthlyCredits: number | null;
  /** When the next monthly renewal grant will land. Null if no active plan. */
  nextResetAt: Date | null;
  planName: string | null;
};

/**
 * One-shot read for the UI: balance + plan context + when the next monthly
 * grant fires. `getBalanceQuery` already calls `ensurePlanGrantCommand`, so
 * the balance returned is post-renewal.
 */
export async function getCreditsSummaryQuery(
  organizationId: string,
): Promise<CreditsSummary> {
  const [balance, subscription] = await Promise.all([
    getBalanceQuery(organizationId),
    db.subscription.findFirst({
      where: {
        referenceId: organizationId,
        status: { in: ['active', 'trialing'] },
      },
      orderBy: { periodStart: 'desc' },
      select: { plan: true, periodStart: true, periodEnd: true },
    }),
  ]);

  let planMonthlyCredits: number | null = null;
  let nextResetAt: Date | null = null;
  let planName: string | null = null;

  if (subscription && subscription.periodStart) {
    planName = subscription.plan;
    const plan = await db.subscriptionPlan.findFirst({
      where: { name: subscription.plan, status: 'ACTIVE' },
      select: { limits: true },
    });
    planMonthlyCredits = readMonthlyCredits(plan?.limits);

    const now = new Date();
    const isPastEnd =
      subscription.periodEnd &&
      now.getTime() > subscription.periodEnd.getTime();
    if (!isPastEnd) {
      const anchor = currentPeriodAnchor(subscription.periodStart, now);
      const next = new Date(anchor);
      next.setUTCMonth(next.getUTCMonth() + 1);
      // Don't show a reset past the subscription's end.
      if (
        !subscription.periodEnd ||
        next.getTime() <= subscription.periodEnd.getTime()
      ) {
        nextResetAt = next;
      }
    }
  }

  return {
    balance: balance.balance,
    lifetimeGranted: balance.lifetimeGranted,
    lifetimeSpent: balance.lifetimeSpent,
    planMonthlyCredits,
    nextResetAt,
    planName,
  };
}

function readMonthlyCredits(limits: unknown): number {
  if (limits && typeof limits === 'object' && !Array.isArray(limits)) {
    const value = (limits as Record<string, unknown>).monthlyCredits;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return DEFAULT_MONTHLY_CREDITS;
}
