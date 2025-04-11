/*
  Warnings:

  - The `file_type` column on the `UserFile` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('UNKNOWN', 'TEXT', 'MARKDOWN', 'EPUB', 'PDF', 'SRT', 'URL');

-- AlterTable
ALTER TABLE "UserFile" DROP COLUMN "file_type",
ADD COLUMN     "file_type" "FileType" NOT NULL DEFAULT 'MARKDOWN';
