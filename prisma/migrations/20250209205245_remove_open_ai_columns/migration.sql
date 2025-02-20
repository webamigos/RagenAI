/*
  Warnings:

  - You are about to drop the column `openai_created_at` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `openai_message_id` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `openai_thread_id` on the `Thread` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Message" DROP COLUMN "openai_created_at",
DROP COLUMN "openai_message_id";

-- AlterTable
ALTER TABLE "Thread" DROP COLUMN "openai_thread_id";
