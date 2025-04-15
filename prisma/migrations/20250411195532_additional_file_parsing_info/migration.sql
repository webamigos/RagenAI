-- CreateEnum
CREATE TYPE "ParsingStatus" AS ENUM ('NOT_STARTED', 'STARTED', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "UserFile" ADD COLUMN     "parsing_completed_at" TIMESTAMPTZ,
ADD COLUMN     "parsing_failed_at" TIMESTAMPTZ,
ADD COLUMN     "parsing_started_at" TIMESTAMPTZ,
ADD COLUMN     "parsing_status" "ParsingStatus" NOT NULL DEFAULT 'NOT_STARTED';
