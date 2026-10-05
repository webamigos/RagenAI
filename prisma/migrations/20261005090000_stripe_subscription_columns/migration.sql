-- Columns `@better-auth/stripe` declares on its subscription table and this
-- schema never had. Better Auth 1.7.3+ checks the Prisma schema at runtime and
-- refuses every auth request while a declared column is missing. All nullable,
-- no backfill: the plugin treats them as optional.
ALTER TABLE "subscriptions"
  ADD COLUMN "cancel_at" TIMESTAMPTZ,
  ADD COLUMN "canceled_at" TIMESTAMPTZ,
  ADD COLUMN "ended_at" TIMESTAMPTZ,
  ADD COLUMN "billing_interval" TEXT,
  ADD COLUMN "stripe_schedule_id" TEXT;
