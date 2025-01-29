-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "openai_message_id" DROP NOT NULL,
ALTER COLUMN "openai_created_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Thread" ALTER COLUMN "openai_thread_id" DROP NOT NULL;
