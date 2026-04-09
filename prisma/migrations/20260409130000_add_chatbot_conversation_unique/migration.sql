-- Drop the existing index (replaced by unique constraint below)
DROP INDEX IF EXISTS "chatbot_conversations_chatbot_id_session_id_idx";

-- Add unique constraint on (chatbot_id, session_id)
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_chatbot_id_session_id_key" UNIQUE ("chatbot_id", "session_id");
