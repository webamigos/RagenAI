-- The worker's per-document model calls: summaries at ingest, the RAG
-- readiness score and Optimize's suggestions. They were recorded as
-- CHAT_COMPLETION, which the monthly message ceiling counts, so uploading
-- documents spent an organization's chat-message limit. The backfill of
-- existing rows is the next migration: Postgres refuses to use an enum value
-- in the transaction that added it.
ALTER TYPE "AiUsageStep" ADD VALUE 'DOCUMENT_PROCESSING';
