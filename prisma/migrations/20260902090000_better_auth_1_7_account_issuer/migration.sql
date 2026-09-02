-- Better Auth 1.7 adds four columns to tables it owns.
--
-- All four are added nullable (or with a default), so a rollback to 1.4.18
-- still works against this schema: the old library simply never writes them.

ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;
ALTER TABLE "accounts" ADD COLUMN "refresh_token_expires_at" TIMESTAMPTZ;
ALTER TABLE "teams" ADD COLUMN "member_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "team_members" ADD COLUMN "membership_key" TEXT;

-- Backfill `issuer` for rows that predate it. 1.7 looks accounts up by
-- (issuer, account_id); a NULL here means an existing sign-in stops matching
-- its account, which would silently strand the user with a new one.
--
-- The values mirror createLocalAccountIssuer / createOAuthAccountIssuer in
-- @better-auth/core: password accounts get `local:credential`, and social
-- accounts get `local:oauth:<provider_id>` because none of the providers this
-- app configures declares an issuer of its own.
UPDATE "accounts"
SET "issuer" = CASE
  WHEN "provider_id" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "provider_id"
END
WHERE "issuer" IS NULL;

-- Matches how the library queries these columns.
CREATE INDEX "accounts_issuer_account_id_idx" ON "accounts" ("issuer", "account_id");
