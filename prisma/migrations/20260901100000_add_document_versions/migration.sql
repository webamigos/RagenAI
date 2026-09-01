-- CreateEnum
CREATE TYPE "change_type" AS ENUM ('UPLOAD', 'MANUAL', 'AI_REWRITE', 'AI_OPTIMIZE', 'ROLLBACK');

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
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
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "user_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Denormalised tenant column: tenant-scope-guard.ts only covers models with a
-- direct org column, and a version reachable purely through user_documents
-- would be invisible to it.
ALTER TABLE "document_versions" ADD COLUMN "organization_id" TEXT NOT NULL;

CREATE INDEX "document_versions_organization_id_idx" ON "document_versions"("organization_id");

-- Exactly one active version per document. Application code already intends
-- this; without the constraint two active rows is a silent correctness failure,
-- because the active row is what the vector store is meant to mirror.
CREATE UNIQUE INDEX "document_versions_one_active_per_document"
    ON "document_versions"("document_id") WHERE "is_active";
