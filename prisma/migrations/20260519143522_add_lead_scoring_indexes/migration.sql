-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "scored_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "lead_lists_scoring_file_id_idx" ON "lead_lists"("scoring_file_id");

-- CreateIndex
CREATE INDEX "leads_lead_list_id_scoring_status_idx" ON "leads"("lead_list_id", "scoring_status");
