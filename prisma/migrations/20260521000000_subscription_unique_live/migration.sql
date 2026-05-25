-- One "live" subscription per organization (referenceId).
-- Live = active or trialing. Historical rows (canceled, superseded,
-- past_due, etc.) are not constrained so we don't break Stripe history.
-- Run `src/scripts/dedupe-subscriptions.ts --apply` before applying
-- this migration in any environment that already has duplicates.
CREATE UNIQUE INDEX "subscriptions_live_per_org_idx"
  ON "subscriptions" ("reference_id")
  WHERE "status" IN ('active', 'trialing');
