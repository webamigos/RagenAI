-- AlterTable
ALTER TABLE "UserDocument" ADD COLUMN     "project_id" INTEGER;

-- AlterTable
ALTER TABLE "UserFile" ADD COLUMN     "project_id" INTEGER;

-- CreateIndex
CREATE INDEX "UserDocument_project_id_idx" ON "UserDocument"("project_id");

-- CreateIndex
CREATE INDEX "UserFile_project_id_idx" ON "UserFile"("project_id");

-- AddForeignKey
ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
