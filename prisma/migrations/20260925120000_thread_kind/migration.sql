-- What a thread is: a chat conversation, or a conversation with the operator's
-- assistant beside Ragen Brain (spec 2026-09-25-brain-operator-assistant).
--
-- Every existing row is a chat thread, which is the default, so no backfill
-- runs. A NOT NULL column with a constant default is a catalog-only change in
-- Postgres 11+, so this does not rewrite the table.

CREATE TYPE "ThreadKind" AS ENUM ('CHAT', 'BRAIN_OPERATOR');

ALTER TABLE "threads"
  ADD COLUMN "kind" "ThreadKind" NOT NULL DEFAULT 'CHAT';

-- The assistant's history list reads one person's BRAIN_OPERATOR threads,
-- newest first.
CREATE INDEX "threads_visitor_id_kind_created_at_idx" ON "threads"("visitor_id", "kind", "created_at");
