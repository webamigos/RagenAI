-- What retrieval put in front of the model for one turn, beside what the
-- answer went on to cite. The difference is the point: a document retrieved
-- on every question and never cited is mis-chunked or irrelevant, and against
-- `document_citations` alone it looks identical to one nobody asks about.
--
-- Purely additive — a new table, no alterations, no backfill. There is no
-- retrieval history to reconstruct (the retrieved set was never persisted),
-- so every metric reading this starts empty on the day it deploys. A revert
-- of the code leaves an unused table behind rather than a broken one.
--
-- The shape mirrors `document_citations` apart from `rank`, so one query
-- shape serves both.
CREATE TABLE "document_retrievals" (
    "id" SERIAL NOT NULL,
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    -- 1-based position after dedupe and rerank. Free to record here, and
    -- unrecoverable afterwards.
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_retrievals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_retrievals_message_id_file_id_key" ON "document_retrievals"("message_id", "file_id");

-- Serves both the dashboard reads and the nightly prune, which deletes per
-- organization precisely so it has an index and an org scope. A prune
-- filtered on `created_at` alone would have neither.
CREATE INDEX "document_retrievals_org_id_created_at_idx" ON "document_retrievals"("org_id", "created_at");

CREATE INDEX "document_retrievals_file_id_idx" ON "document_retrievals"("file_id");

-- Cascades, as `document_citations` has. Deleting a file removes its
-- retrievals, so historical rates shift under a deletion — accepted, because
-- the alternative is retaining rows that point at files an organization asked
-- to remove.
ALTER TABLE "document_retrievals" ADD CONSTRAINT "document_retrievals_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_retrievals" ADD CONSTRAINT "document_retrievals_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "user_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
