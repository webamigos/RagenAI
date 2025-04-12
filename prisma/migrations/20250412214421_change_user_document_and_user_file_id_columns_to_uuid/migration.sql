/*
  Warnings:

  - The primary key for the `UserDocument` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "UserDocument" DROP CONSTRAINT "UserDocument_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "file_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "UserDocument_id_seq";

-- AlterTable
ALTER TABLE "UserFile" ALTER COLUMN "document_id" SET DATA TYPE TEXT;
