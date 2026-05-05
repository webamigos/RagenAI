-- CreateIndex
CREATE UNIQUE INDEX "document_citations_message_id_file_id_key" ON "document_citations"("message_id", "file_id");
