-- An assistant can be told to answer only from its documents (spec
-- 2026-10-03-retrieval-claims-match-the-product-before-launch, Phase C2).
--
-- Nullable and without a default, and no backfill: `null` means "the default
-- for this project's surface", resolved at read time — strict when the
-- project has the public chatbot enabled, today's rule otherwise. So every
-- existing chatbot-enabled project becomes strict on deploy, and every other
-- project keeps its current behaviour. That flip is intended (Q3).
--
-- Adding a nullable column with no default is a catalog-only change in
-- Postgres, so this does not rewrite the table, and it is safe to leave in
-- place if the application change is reverted.

ALTER TABLE "project_settings"
  ADD COLUMN "answer_from_documents_only" BOOLEAN;
