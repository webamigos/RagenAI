-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "message_type" "MessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "voice_duration_seconds" INTEGER;
