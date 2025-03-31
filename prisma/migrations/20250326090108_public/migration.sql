/*
  Warnings:

  - A unique constraint covering the columns `[public_access_token_id]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_access_token_id" TEXT,
ADD COLUMN     "published_at" TIMESTAMPTZ;

-- CreateIndex
CREATE UNIQUE INDEX "Project_public_access_token_id_key" ON "Project"("public_access_token_id");
