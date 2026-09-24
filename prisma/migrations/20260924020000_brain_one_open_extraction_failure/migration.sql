-- Ragen Brain B3: one open EXTRACTION_FAILED per document, enforced here.
--
-- The worker checks for an open finding and creates one if there is none —
-- correct at BRAIN_EXTRACT_CONCURRENCY=1, a race at anything higher, and a
-- Temporal install has no concurrency limit at all. The index makes the
-- second insert fail, and the worker then refreshes the row the first one
-- created. Duplicates that already exist are resolved first, keeping the
-- lowest id — the one a person saw first — so the index can be built.

UPDATE "knowledge_findings" AS f
   SET "status" = 'RESOLVED', "resolved_at" = now()
 WHERE f."type" = 'EXTRACTION_FAILED'
   AND f."status" = 'OPEN'
   AND EXISTS (
     SELECT 1 FROM "knowledge_findings" AS k
      WHERE k."organization_id" = f."organization_id"
        AND k."file_id" = f."file_id"
        AND k."type" = 'EXTRACTION_FAILED'
        AND k."status" = 'OPEN'
        AND k."id" < f."id"
   );

CREATE UNIQUE INDEX "knowledge_findings_one_open_extraction_failure"
  ON "knowledge_findings" ("organization_id", "file_id")
  WHERE "type" = 'EXTRACTION_FAILED' AND "status" = 'OPEN';
