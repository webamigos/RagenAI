-- Better Auth 1.7 matches a local credential account on all three of
-- provider_id, issuer and account_id, and for a credential it expects
-- account_id to hold the user id. The preceding migration backfilled issuer
-- but not this, so any row that stored something else there (an email, say)
-- still fails to match: the user cannot sign in with a password, and
-- `updatePassword` — which filters on the same fields — silently updates
-- zero rows.
--
-- The library has only ever written user_id here for credentials, so rows that
-- disagree came from outside it (a seed or a manual insert) and normalising
-- them loses nothing.

-- Preflight. accounts has a unique index on (provider_id, account_id), so if
-- one user somehow holds more than one credential row, setting every one of
-- them to that user's id collides and the UPDATE below aborts with nothing but
-- a constraint name. Stop here instead, and say whose rows they are.
--
-- This deliberately does not merge or delete anything. Which of two stored
-- passwords should survive is not a decision a migration can make: guessing
-- wrong either locks the account out or keeps a password alive that someone
-- believed they had replaced. Resolve the duplicates by hand, then re-run.
DO $$
DECLARE
  conflicted text;
BEGIN
  SELECT string_agg(dup."user_id", ', ')
  INTO conflicted
  FROM (
    SELECT "user_id"
    FROM "accounts"
    WHERE "provider_id" = 'credential'
    GROUP BY "user_id"
    HAVING count(*) > 1
  ) dup;

  IF conflicted IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot normalise credential account_id: these users hold more than one credential account, and pointing every one of them at the user id would violate accounts_provider_id_account_id_key. Resolve the duplicates, then re-run this migration. Affected user_id values: %',
      conflicted;
  END IF;
END
$$;

UPDATE "accounts"
SET "account_id" = "user_id"
WHERE "provider_id" = 'credential'
  AND "account_id" IS DISTINCT FROM "user_id";
