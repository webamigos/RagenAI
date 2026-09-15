-- B5 of the LiteLLM retirement: the virtual keys go.
--
-- These three columns existed to carry LiteLLM's own per-team and per-org
-- budgets. Phase A moved those into the database — every chat surface calls
-- `assertWithinUsageLimits` before the turn, and the API surfaces call
-- `checkUsageCeilings` — so the proxy's copy has had no authority for some
-- time. What is dropped here is a cache of limits the application already
-- enforces, not the limits themselves.
--
-- `Team.budgetUsdCents`, `budgetDuration`, `rpmLimit`, `tpmLimit` and
-- `allowedModels` are deliberately kept: those are Ragen's own settings and
-- are read from the database. Only the proxy's identifiers go.
--
-- Deploy ordering matters and is one-way: the application stops selecting
-- these columns in the same release. A rollback to an image that still
-- selects them would fail against this schema, so roll the migration back
-- with it or roll forward.

ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "litellm_api_key";

ALTER TABLE "teams" DROP COLUMN IF EXISTS "litellm_team_id";
ALTER TABLE "teams" DROP COLUMN IF EXISTS "litellm_key_token";
