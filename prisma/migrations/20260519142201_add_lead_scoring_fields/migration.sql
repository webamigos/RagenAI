-- CreateEnum
CREATE TYPE "lead_scoring_status" AS ENUM ('idle', 'pending', 'scored', 'failed');

-- AlterTable
ALTER TABLE "lead_lists" ADD COLUMN     "scoring_file_id" UUID;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "scoring_error" TEXT,
ADD COLUMN     "scoring_status" "lead_scoring_status" NOT NULL DEFAULT 'idle';

-- AddForeignKey
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_scoring_file_id_fkey" FOREIGN KEY ("scoring_file_id") REFERENCES "user_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
