/*
  Warnings:

  - The `file_id` column on the `UserDocument` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `UserFile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `UserFile` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "UserDocument" DROP CONSTRAINT "UserDocument_file_id_fkey";

-- AlterTable
ALTER TABLE "UserDocument" DROP COLUMN "file_id",
ADD COLUMN     "file_id" BIGINT;

-- AlterTable
ALTER TABLE "UserFile" DROP CONSTRAINT "UserFile_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
ADD CONSTRAINT "UserFile_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "UserDocument_file_id_key" ON "UserDocument"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserFile_id_organization_id_key" ON "UserFile"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "UserFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
