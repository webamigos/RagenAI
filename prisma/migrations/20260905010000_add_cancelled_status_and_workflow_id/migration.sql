-- Enables real cancellation of an in-flight ingest. Before this, the worker's
-- AGENTS.md and apps/web's Temporal client both referenced a `cancelEmbedding`
-- signal / `embeddingState` query that had no handler anywhere in the worker
-- and no way to address a running workflow by fileId — this closes both gaps.
--
-- Adding an enum value is non-breaking: existing rows are untouched and older
-- application versions never produce it. See
-- docs/lessons/adding-an-enum-value-breaks-older-readers.md before writing to
-- CANCELLED from any reader that might not have this migration's client yet.
ALTER TYPE "ParsingStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "EmbeddingStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Set once when apps/web starts the runFileEmbeddings/scrapeWebsite workflow,
-- so a later cancel request can look up the workflow id by fileId and target
-- the signal at the right run instead of needing it passed in separately.
ALTER TABLE "user_files" ADD COLUMN "workflow_id" TEXT;
