-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "organization_id" INTEGER;

-- CreateIndex
CREATE INDEX "ApiKey_organization_id_idx" ON "ApiKey"("organization_id");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
