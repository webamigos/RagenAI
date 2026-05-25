-- AlterTable
ALTER TABLE "lead_lists" ADD COLUMN "scoring_criteria" JSONB,
ADD COLUMN "scoring_disqualifiers" JSONB,
ADD COLUMN "scoring_criteria_error" TEXT;
