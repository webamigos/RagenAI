import db from '@ragenai/prisma-client';
import { CreditLedgerReason } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { grantCreditsCommand } from './grant-credits-command';
import { DEFAULT_MONTHLY_CREDITS } from '../../constants/credit-costs';

/**
 * Resolve a plan's monthly credit allotment and grant it to the org with
 * RESET semantics — overwrites the current balance (no carry-over).
 *
 * Reads `monthlyCredits` from `SubscriptionPlan.limits`. If the plan has no
 * explicit value, falls back to `DEFAULT_MONTHLY_CREDITS`. Explicit
 * `monthlyCredits: 0` disables grants for that plan (no-op, returns null).
 *
 * Idempotent via `idempotencyKey` — pass `plan:{planId}:{periodStart-iso}`
 * for monthly renewals, `stripe:invoice:{invoiceId}` from Stripe webhooks,
 * or `plan:{orgId}:{planName}` for one-shot assignments.
 */
export async function grantPlanCreditsCommand(input: {
  organizationId: string;
  planName: string;
  idempotencyKey: string;
  actorUserId?: string;
}): Promise<{ balance: number; granted: number } | null> {
  const plan = await db.subscriptionPlan.findFirst({
    where: { name: input.planName, status: 'ACTIVE' },
    select: { id: true, name: true, limits: true },
  });
  if (!plan) {
    logger.warn(
      { planName: input.planName },
      'grantPlanCreditsCommand: plan not found',
    );
    return null;
  }

  const monthlyCredits = readMonthlyCredits(plan.limits);
  if (monthlyCredits === 0) {
    return null;
  }

  const result = await grantCreditsCommand({
    organizationId: input.organizationId,
    amount: monthlyCredits,
    reason: CreditLedgerReason.RESET,
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    note: `Plan grant: ${plan.name}`,
    metadata: { planName: plan.name, planId: plan.id },
  });

  return { balance: result.balance, granted: monthlyCredits };
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
