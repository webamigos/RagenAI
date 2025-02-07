/*
  Warnings:

  - You are about to drop the column `organization_id` on the `Project` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_organization_id_fkey";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "organization_id",
ADD COLUMN     "internal_organization_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_internal_organization_id_fkey" FOREIGN KEY ("internal_organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
