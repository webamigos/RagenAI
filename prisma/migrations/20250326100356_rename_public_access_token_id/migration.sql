/*
  Warnings:

  - You are about to drop the column `public_access_token_id` on the `Project` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[access_token]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Project_public_access_token_id_key";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "public_access_token_id",
ADD COLUMN     "access_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_access_token_key" ON "Project"("access_token");

-- CreateIndex
CREATE INDEX "Project_access_token_idx" ON "Project"("access_token");
