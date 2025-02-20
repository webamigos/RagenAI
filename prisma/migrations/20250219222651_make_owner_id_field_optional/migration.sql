-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_organization_id_fkey";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "internal_organization_id" INTEGER,
ADD COLUMN     "owner_id" TEXT,
ALTER COLUMN "organization_id" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "Project_organization_id_idx" ON "Project"("organization_id");

-- CreateIndex
CREATE INDEX "Project_owner_id_idx" ON "Project"("owner_id");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_internal_organization_id_fkey" FOREIGN KEY ("internal_organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
