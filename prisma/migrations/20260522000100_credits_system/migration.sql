-- Credits system: per-org balance + immutable ledger

CREATE TYPE "CreditLedgerReason" AS ENUM (
  'GRANT_TRIAL',
  'GRANT_PLAN',
  'GRANT_TOPUP',
  'GRANT_ADMIN',
  'SPEND',
  'REFUND',
  'RESET'
);

CREATE TYPE "CreditOperation" AS ENUM (
  'ENRICH_REJESTRIO',
  'SCORE_LEAD_CRITERION',
  'SCORE_LEAD_DISQUALIFIER',
  'SCORE_LEAD_SINGLE_PROMPT'
);

CREATE TABLE "org_credit_balances" (
  "organization_id"   TEXT PRIMARY KEY,
  "balance"           INTEGER NOT NULL DEFAULT 0,
  "lifetime_granted"  INTEGER NOT NULL DEFAULT 0,
  "lifetime_spent"    INTEGER NOT NULL DEFAULT 0,
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_credit_balances_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE TABLE "credit_ledger_entries" (
  "id"               SERIAL PRIMARY KEY,
  "public_id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"  TEXT NOT NULL,
  "user_id"          TEXT,
  "delta"            INTEGER NOT NULL,
  "balance_after"    INTEGER NOT NULL,
  "reason"           "CreditLedgerReason" NOT NULL,
  "operation"        "CreditOperation",
  "reference_id"     TEXT,
  "idempotency_key"  TEXT,
  "note"             TEXT,
  "metadata"         JSONB,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_ledger_entries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "credit_ledger_entries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "credit_ledger_entries_public_id_key"
  ON "credit_ledger_entries"("public_id");

CREATE UNIQUE INDEX "credit_ledger_entries_organization_id_idempotency_key_key"
  ON "credit_ledger_entries"("organization_id", "idempotency_key");

CREATE INDEX "credit_ledger_entries_organization_id_created_at_idx"
  ON "credit_ledger_entries"("organization_id", "created_at" DESC);

CREATE INDEX "credit_ledger_entries_reason_idx"
  ON "credit_ledger_entries"("reason");
