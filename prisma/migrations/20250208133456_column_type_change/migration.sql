/*
  Warnings:

  - The `message_type` column on the `Message` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
-- CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "message_type",
ADD COLUMN     "message_type" "MessageContentType" NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "project_id" INTEGER;

-- DropEnum
DROP TYPE IF EXISTS "MessageType";

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
