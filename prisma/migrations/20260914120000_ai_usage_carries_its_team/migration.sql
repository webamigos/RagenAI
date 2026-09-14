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

-- NOT VALID, then validated separately.
--
-- A plain ADD CONSTRAINT scans the whole table to verify existing rows while
-- holding a lock that blocks writes, and `trackAiUsage` writes here on every
-- AI call — with its errors suppressed, so a blocked write does not fail
-- loudly, it just loses the usage row. There is nothing to verify anyway:
-- every existing row has team_id NULL, which satisfies the constraint by
-- definition. VALIDATE CONSTRAINT afterwards takes a weaker lock that lets
-- writes through, and future rows are checked from the moment the constraint
-- exists either way.
ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "ai_usage" VALIDATE CONSTRAINT "ai_usage_team_id_fkey";
