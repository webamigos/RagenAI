-- Add unique constraint to prevent duplicate threads per chatbot session
CREATE UNIQUE INDEX "threads_chatbot_id_visitor_id_key" ON "threads"("chatbot_id", "visitor_id");
