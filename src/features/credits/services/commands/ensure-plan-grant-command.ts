import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { grantPlanCreditsCommand } from './grant-plan-credits-command';
import { currentPeriodAnchor } from '../../utils/period-anchor';

/**
 * Lazy monthly renewal — no cron required.
 *
 * Looks up the org's active subscription, computes the current monthly
 * billing period anchor from `subscription.periodStart`, and fires
 * `grantPlanCreditsCommand` with an idempotency key tied to that anchor.
 * If this period has already been granted (the common case on subsequent
 * reads), the grant is a no-op via the idempotency-key unique constraint.
 *
 * Designed to be called transparently before any balance check or spend:
 * the first read after a period rollover triggers exactly one grant; later
 * reads in the same period see no extra work.
 *
 * Soft-fails on any error — credit reads should never break because the
 * renewal step had a hiccup. The pre-existing balance (or 0) is what the
 * caller will see; the next call retries.
 */
export async function ensurePlanGrantCommand(
  organizationId: string,
): Promise<void> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        referenceId: organizationId,
        status: { in: ['active', 'trialing'] },
      },
      select: { plan: true, periodStart: true, periodEnd: true },
      orderBy: { periodStart: 'desc' },
    });
    if (!subscription || !subscription.periodStart) {
      return;
    }
    // Don't extend grants past the subscription's end. A cancelled/expired
    // plan stops getting renewals at its periodEnd.
    const now = new Date();
    if (
      subscription.periodEnd &&
      now.getTime() > subscription.periodEnd.getTime()
    ) {
      return;
    }

    const anchor = currentPeriodAnchor(subscription.periodStart, now);
    const idempotencyKey = `plan:${organizationId}:${subscription.plan}:${anchor.toISOString().slice(0, 10)}`;

    await grantPlanCreditsCommand({
      organizationId,
      planName: subscription.plan,
      idempotencyKey,
    });
  } catch (err) {
    logger.warn(
      { err, organizationId },
      'ensurePlanGrantCommand: renewal check failed (non-fatal)',
    );
  }
}
