-- CreateTable
CREATE TABLE "document_citations" (
    "id" SERIAL NOT NULL,
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "org_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_citations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_citations_file_id_idx" ON "document_citations"("file_id");

-- CreateIndex
CREATE INDEX "document_citations_org_id_created_at_idx" ON "document_citations"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "document_citations" ADD CONSTRAINT "document_citations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_citations" ADD CONSTRAINT "document_citations_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "user_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
