/*
  Warnings:

  - The `message_type` column on the `Message` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "message_type",
ADD COLUMN     "message_type" "MessageContentType" NOT NULL DEFAULT 'TEXT';

-- DropEnum
DROP TYPE "MessageType";
