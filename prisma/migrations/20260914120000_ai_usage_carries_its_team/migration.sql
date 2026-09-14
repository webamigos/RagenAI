-- Team usage moves off the proxy's spend log and onto `ai_usage`.
--
-- `ai_usage` had no team dimension, which is why `get-team-usage-query` read
-- LiteLLM's `/spend/logs` instead: the proxy knows which virtual key paid, and
-- the application did not. The column closes that gap.
--
-- Nullable, and deliberately not backfilled. Historical rows cannot be
-- attributed: `Thread.teamId` would cover chat turns and nothing else, and a
-- partial backfill is worse than none — a team's total would silently exclude
-- whichever of its work had no thread. Team usage therefore starts at this
-- migration, which is the decision recorded as Q2 in
-- docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a team must not delete the
-- spend it incurred. The organization still paid for it, and the org-level
-- totals that back the usage ceilings read the same rows.
ALTER TABLE "ai_usage" ADD COLUMN "team_id" TEXT;

CREATE INDEX "ai_usage_team_id_created_at_idx" ON "ai_usage"("team_id", "created_at");

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
