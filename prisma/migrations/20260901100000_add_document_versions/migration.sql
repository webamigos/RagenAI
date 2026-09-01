-- CreateEnum
CREATE TYPE "change_type" AS ENUM ('UPLOAD', 'MANUAL', 'AI_REWRITE', 'AI_OPTIMIZE', 'ROLLBACK');

-- Target for the composite foreign key below.
CREATE UNIQUE INDEX "user_documents_id_organization_id_key" ON "user_documents"("id", "organization_id");

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    -- Denormalised from the parent document: tenant-scope-guard.ts only covers
    -- models with a direct org column, so a version reachable purely through
    -- user_documents would be invisible to it.
    "organization_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB,
    "rag_score" JSONB,
    "change_type" "change_type" NOT NULL,
    "author_id" TEXT,
    "comment" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");

-- CreateIndex
CREATE INDEX "document_versions_organization_id_idx" ON "document_versions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- Exactly one active version per document. The application already intends
-- this; without the constraint two active rows is a silent correctness
-- failure, because the active row is what the vector store mirrors.
CREATE UNIQUE INDEX "document_versions_one_active_per_document"
    ON "document_versions"("document_id") WHERE "is_active";

-- Composite on purpose. Keyed on document_id alone, a version's
-- organization_id could drift from its document's and every tenant filter
-- would still pass.
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_organization_id_fkey"
    FOREIGN KEY ("document_id", "organization_id")
    REFERENCES "user_documents"("id", "organization_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
