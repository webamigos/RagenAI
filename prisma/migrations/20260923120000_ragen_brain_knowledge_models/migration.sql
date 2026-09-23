-- Ragen Brain, Phase A2: five models and two EmbeddingStatus members.
-- docs/specs/2026-09-18-ragen-brain-knowledge-curation.md
--
-- Additive only. Nothing existing reads these tables, and no row written
-- before this migration can carry STAGED or WITHDRAWN, so there is no
-- backfill. The `brain` feature key defaults to false, so the release that
-- carries this changes no behaviour.
--
-- The generated part is below unchanged; three things Prisma cannot express
-- are at the end, each with the reason it lives in the database rather than
-- in application code.

-- CreateEnum
CREATE TYPE "KnowledgePageType" AS ENUM ('PROCESS', 'ENTITY', 'POLICY', 'PRODUCT', 'ROLE');

-- CreateEnum
CREATE TYPE "KnowledgePageStatus" AS ENUM ('CANDIDATE', 'APPROVED', 'REJECTED', 'STALE');

-- CreateEnum
CREATE TYPE "KnowledgeEdgeOrigin" AS ENUM ('EXTRACTED', 'INFERRED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "KnowledgeFindingType" AS ENUM ('CONTRADICTION', 'GAP', 'STALE', 'ORPHAN', 'UNOWNED', 'EXTRACTION_FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeFindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "KnowledgeFindingStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "KnowledgeDecisionAction" AS ENUM ('APPROVE', 'REJECT', 'MERGE', 'SET_OWNER', 'SET_ACCESS', 'WIDEN_ACCESS', 'PUBLISH', 'UNPUBLISH', 'VERIFY');

-- AlterEnum
-- Two values on one enum is fine from PostgreSQL 12; neither is used in this
-- migration, which is the other thing ADD VALUE inside a transaction forbids.
ALTER TYPE "EmbeddingStatus" ADD VALUE 'STAGED';
ALTER TYPE "EmbeddingStatus" ADD VALUE 'WITHDRAWN';

-- CreateTable
CREATE TABLE "knowledge_pages" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "KnowledgePageType" NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "KnowledgePageStatus" NOT NULL DEFAULT 'CANDIDATE',
    "owner_id" TEXT,
    "accessible_by" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valid_from" DATE,
    "superseded_by_id" INTEGER,
    "verify_every" TEXT,
    "last_verified_at" TIMESTAMPTZ,
    "last_verified_by" TEXT,
    "published_file_id" UUID,
    "published_at" TIMESTAMPTZ,
    "publication_generation" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "knowledge_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_page_sources" (
    "id" SERIAL NOT NULL,
    "organization_id" TEXT NOT NULL,
    "page_id" INTEGER NOT NULL,
    "file_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "span" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "source_deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_page_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_edges" (
    "id" SERIAL NOT NULL,
    "organization_id" TEXT NOT NULL,
    "from_page_id" INTEGER NOT NULL,
    "to_page_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "origin" "KnowledgeEdgeOrigin" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_findings" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "KnowledgeFindingType" NOT NULL,
    "severity" "KnowledgeFindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "page_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "file_id" UUID,
    "detail" JSONB,
    "status" "KnowledgeFindingStatus" NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "knowledge_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_decisions" (
    "id" SERIAL NOT NULL,
    "organization_id" TEXT NOT NULL,
    "page_id" INTEGER NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" "KnowledgeDecisionAction" NOT NULL,
    "publication_generation" INTEGER,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_pages_public_id_key" ON "knowledge_pages"("public_id");

-- CreateIndex
CREATE INDEX "knowledge_pages_organization_id_status_idx" ON "knowledge_pages"("organization_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_pages_owner_id_idx" ON "knowledge_pages"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_pages_id_organization_id_key" ON "knowledge_pages"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_pages_organization_id_slug_key" ON "knowledge_pages"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_pages_published_file_id_key" ON "knowledge_pages"("published_file_id");

-- CreateIndex
CREATE INDEX "knowledge_page_sources_page_id_idx" ON "knowledge_page_sources"("page_id");

-- CreateIndex
CREATE INDEX "knowledge_page_sources_organization_id_file_id_idx" ON "knowledge_page_sources"("organization_id", "file_id");

-- CreateIndex
CREATE INDEX "knowledge_edges_organization_id_idx" ON "knowledge_edges"("organization_id");

-- CreateIndex
CREATE INDEX "knowledge_edges_to_page_id_idx" ON "knowledge_edges"("to_page_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_edges_from_page_id_to_page_id_kind_key" ON "knowledge_edges"("from_page_id", "to_page_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_findings_public_id_key" ON "knowledge_findings"("public_id");

-- CreateIndex
CREATE INDEX "knowledge_findings_organization_id_status_type_idx" ON "knowledge_findings"("organization_id", "status", "type");

-- CreateIndex
CREATE INDEX "knowledge_findings_organization_id_file_id_idx" ON "knowledge_findings"("organization_id", "file_id");

-- CreateIndex
CREATE INDEX "knowledge_decisions_organization_id_created_at_idx" ON "knowledge_decisions"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_decisions_page_id_action_publication_generation_key" ON "knowledge_decisions"("page_id", "action", "publication_generation");

-- AddForeignKey
ALTER TABLE "knowledge_pages" ADD CONSTRAINT "knowledge_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_pages" ADD CONSTRAINT "knowledge_pages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_pages" ADD CONSTRAINT "knowledge_pages_superseded_by_id_organization_id_fkey" FOREIGN KEY ("superseded_by_id", "organization_id") REFERENCES "knowledge_pages"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_pages" ADD CONSTRAINT "knowledge_pages_published_file_id_organization_id_fkey" FOREIGN KEY ("published_file_id", "organization_id") REFERENCES "user_files"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_page_sources" ADD CONSTRAINT "knowledge_page_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_page_sources" ADD CONSTRAINT "knowledge_page_sources_page_id_organization_id_fkey" FOREIGN KEY ("page_id", "organization_id") REFERENCES "knowledge_pages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_from_page_id_organization_id_fkey" FOREIGN KEY ("from_page_id", "organization_id") REFERENCES "knowledge_pages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_to_page_id_organization_id_fkey" FOREIGN KEY ("to_page_id", "organization_id") REFERENCES "knowledge_pages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_findings" ADD CONSTRAINT "knowledge_findings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_decisions" ADD CONSTRAINT "knowledge_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_decisions" ADD CONSTRAINT "knowledge_decisions_page_id_organization_id_fkey" FOREIGN KEY ("page_id", "organization_id") REFERENCES "knowledge_pages"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- A finding's subject has the shape its type says, and never none at all —
-- an orphaned finding is one nobody can open, resolve or even attribute:
-- CONTRADICTION is between pages (two or more, no file); EXTRACTION_FAILED is
-- about a document that produced no page (a file, no page); everything else
-- is about one page, optionally naming the file concerned. Prisma leaves a
-- list column nullable, and a CHECK that evaluates to NULL passes, so NULL is
-- folded into "empty" rather than trusted to the client never to write it.
ALTER TABLE "knowledge_findings"
  ADD CONSTRAINT "knowledge_findings_subject_matches_type"
  CHECK (
    CASE "type"
      WHEN 'CONTRADICTION' THEN
        COALESCE(cardinality("page_ids"), 0) >= 2 AND "file_id" IS NULL
      WHEN 'EXTRACTION_FAILED' THEN
        COALESCE(cardinality("page_ids"), 0) = 0 AND "file_id" IS NOT NULL
      ELSE
        COALESCE(cardinality("page_ids"), 0) = 1
    END
  );

-- A publication generation belongs to PUBLISH and UNPUBLISH and to nothing
-- else. The unique index on (page_id, action, publication_generation) is what
-- makes a retried publication collide with its own row; that works for the
-- other actions only because their generation is NULL, and a default of 0
-- would make the ledger refuse a page's second APPROVE.
ALTER TABLE "knowledge_decisions"
  ADD CONSTRAINT "knowledge_decisions_generation_only_on_publication"
  CHECK (
    ("action" IN ('PUBLISH', 'UNPUBLISH')) = ("publication_generation" IS NOT NULL)
  );

-- The ledger is append-only. UPDATE is refused outright; DELETE is left alone
-- because deleting an organization cascades here, and a ledger that blocked
-- that would make an organization undeletable. Application code never deletes
-- a decision, and the page FK (NO ACTION) stops a page with a history from
-- being deleted out from under it.
CREATE FUNCTION "knowledge_decisions_refuse_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'knowledge_decisions is append-only (decision %)', OLD."id"
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "knowledge_decisions_append_only"
  BEFORE UPDATE ON "knowledge_decisions"
  FOR EACH ROW EXECUTE FUNCTION "knowledge_decisions_refuse_update"();
