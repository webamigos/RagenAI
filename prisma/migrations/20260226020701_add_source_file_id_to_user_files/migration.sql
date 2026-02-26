-- AlterTable
ALTER TABLE "user_files" ADD COLUMN     "source_file_id" TEXT;

-- CreateIndex
CREATE INDEX "user_files_source_file_id_idx" ON "user_files"("source_file_id");

-- AddForeignKey
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "user_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
