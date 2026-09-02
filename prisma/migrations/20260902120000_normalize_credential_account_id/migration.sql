-- Better Auth 1.7 matches a local credential account on all three of
-- provider_id, issuer and account_id, and for a credential it expects
-- account_id to hold the user id. The preceding migration backfilled issuer
-- but not this, so any row that stored something else there (an email, say)
-- still fails to match: the user cannot sign in with a password, and
-- `updatePassword` — which filters on the same four fields — silently updates
-- zero rows.
--
-- The library has only ever written user_id here for credentials, so rows that
-- disagree came from outside it (a seed or a manual insert) and normalising
-- them loses nothing.
UPDATE "accounts"
SET "account_id" = "user_id"
WHERE "provider_id" = 'credential'
  AND "account_id" IS DISTINCT FROM "user_id";
