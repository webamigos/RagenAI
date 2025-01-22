-- AlterTable
ALTER TABLE "UserDocument" ADD COLUMN     "file_id" TEXT;

-- AlterTable
ALTER TABLE "UserFile" ADD COLUMN     "public_id" TEXT;

-- CreateIndex
CREATE INDEX "UserDocument_organization_id_idx" ON "UserDocument"("organization_id");

-- CreateIndex
CREATE INDEX "UserFile_public_id_idx" ON "UserFile"("public_id");

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "UserFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
