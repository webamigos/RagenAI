-- An API key says what it may reach, in the same vocabulary a thread uses.
--
-- The type already exists (20260909200000, `threads.knowledge_scope`) and is
-- reused deliberately: ADR-33. A second enum meaning the same three things is
-- the drift that package exists to prevent, and `scopeRequiresProject()` in
-- @ragenai/platform-contracts already states the rule this column needs —
-- `ASSISTANT` with no project is rejected, never widened to the knowledge base.
--
-- `KNOWLEDGE_BASE` is the right default for every existing row: all of them
-- have a null `project_id`, because nothing in the monorepo has ever written
-- that column. It also matches `DEFAULT_KNOWLEDGE_SCOPE`.
--
-- Additive and safe to deploy ahead of the application, which does not read
-- the column until the next release.

ALTER TABLE "api_keys"
  ADD COLUMN "knowledge_scope" "knowledge_scope" NOT NULL DEFAULT 'KNOWLEDGE_BASE';
