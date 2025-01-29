-- CreateEnum
CREATE TYPE "PreferredCommunicationType" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "preferred_communication_type" "PreferredCommunicationType" NOT NULL DEFAULT 'TEXT';
