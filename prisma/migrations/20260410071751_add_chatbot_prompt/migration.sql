-- DropIndex
DROP INDEX "chatbot_conversations_chatbot_id_idx";

-- DropIndex
DROP INDEX "chatbot_conversations_session_id_idx";

-- AlterTable
ALTER TABLE "chatbot_conversations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "chatbot_messages" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "chatbots" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "widget_token" DROP DEFAULT;
