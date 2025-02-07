-- CreateEnum
CREATE TYPE "ThreadCommunicationType" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "preferred_communication_type" "ThreadCommunicationType" NOT NULL DEFAULT 'TEXT';
