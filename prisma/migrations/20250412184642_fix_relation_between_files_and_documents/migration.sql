/*
  Warnings:

  - A unique constraint covering the columns `[file_id]` on the table `UserDocument` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UserFile" ADD COLUMN     "document_id" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "UserDocument_file_id_key" ON "UserDocument"("file_id");
