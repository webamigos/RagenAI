-- Defense-in-depth: forbid negative credit values at the DB level.
-- The service layer already prevents this (spend bails on insufficient,
-- adjust floors at 0), but a direct write — backfill script, admin SQL,
-- ad-hoc fix — could otherwise leave the org in a nonsensical state.

ALTER TABLE "org_credit_balances"
  ADD CONSTRAINT "org_credit_balances_balance_nonneg" CHECK ("balance" >= 0);

ALTER TABLE "org_credit_balances"
  ADD CONSTRAINT "org_credit_balances_lifetime_granted_nonneg"
  CHECK ("lifetime_granted" >= 0);

ALTER TABLE "org_credit_balances"
  ADD CONSTRAINT "org_credit_balances_lifetime_spent_nonneg"
  CHECK ("lifetime_spent" >= 0);

ALTER TABLE "credit_ledger_entries"
  ADD CONSTRAINT "credit_ledger_entries_balance_after_nonneg"
  CHECK ("balance_after" >= 0);
