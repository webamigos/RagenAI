-- Add unique constraint to prevent duplicate (messageId, fileId) pairs in document_citations
CREATE UNIQUE INDEX "document_citations_message_id_file_id_key" ON "document_citations"("message_id", "file_id");
