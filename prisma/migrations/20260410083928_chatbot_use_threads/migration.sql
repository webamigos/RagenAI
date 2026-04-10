-- Migrate chatbot conversations to use Thread+Message instead of ChatbotConversation+ChatbotMessage

-- Add chatbot_id to threads table
ALTER TABLE "threads" ADD COLUMN "chatbot_id" UUID;

-- Add foreign key constraint
ALTER TABLE "threads" ADD CONSTRAINT "threads_chatbot_id_fkey"
  FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index on chatbot_id
CREATE INDEX "threads_chatbot_id_idx" ON "threads"("chatbot_id");

-- Drop old chatbot conversation tables (data is not migrated — feature is new, no production data)
DROP TABLE IF EXISTS "chatbot_messages";
DROP TABLE IF EXISTS "chatbot_conversations";
