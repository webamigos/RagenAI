-- AlterTable
ALTER TABLE "threads" ADD COLUMN     "is_starred" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "threads_visitor_id_is_starred_created_at_idx" ON "threads"("visitor_id", "is_starred", "created_at");
