import { grantPlanCreditsCommand } from './grant-plan-credits-command';
import { logger } from '@/app/lib/utils/logger';

/**
 * Bridges Better Auth's Stripe-plugin lifecycle callbacks to credit grants.
 *
 * Fires for both `onSubscriptionComplete` (first checkout) and
 * `onSubscriptionUpdate` (renewals — Stripe `customer.subscription.updated`).
 * In both cases, we grant the plan's monthly credits with an idempotency key
 * tied to `(subscriptionId, periodStart)` so:
 *
 *   - Concurrent `complete` + `update` deliveries dedupe to a single grant.
 *   - The same period redelivered by Stripe (webhook retries) is a no-op.
 *   - A new period (periodStart advanced) produces a fresh grant.
 *
 * The lazy renewal in `getBalanceQuery` would eventually catch up anyway,
 * but firing here means the user's new balance is visible immediately
 * after checkout / renewal rather than on next dashboard load.
 *
 * Soft-fails — webhook delivery must not 5xx because credits had a hiccup.
 */
export async function handleStripeSubscriptionEvent(input: {
  organizationId: string;
  planName: string;
  stripeSubscriptionId: string;
  periodStart: Date | null;
}): Promise<void> {
  if (!input.organizationId || !input.planName) {
    return;
  }
  // Use the SAME idempotency key shape as `ensurePlanGrantCommand`
  // (the lazy renewal path) so a Stripe webhook delivery and a lazy
  // renewal read for the same period dedupe to a single grant via the
  // DB's unique `(organizationId, idempotencyKey)` constraint.
  const periodAnchor = (input.periodStart ?? new Date())
    .toISOString()
    .slice(0, 10);
  const idempotencyKey = `plan:${input.organizationId}:${input.planName}:${periodAnchor}`;
  try {
    await grantPlanCreditsCommand({
      organizationId: input.organizationId,
      planName: input.planName,
      idempotencyKey,
    });
  } catch (err) {
    logger.error(
      { err, input },
      'handleStripeSubscriptionEvent: grant failed (non-fatal)',
    );
  }
}
