-- CreateEnum
CREATE TYPE "PiiPolicy" AS ENUM ('NONE', 'TOXIC_ONLY', 'STRICT');

-- AlterTable
ALTER TABLE "document_folders" ADD COLUMN     "pii_policy" "PiiPolicy" NOT NULL DEFAULT 'TOXIC_ONLY';

-- AlterTable
ALTER TABLE "user_files" ADD COLUMN     "pii_policy" "PiiPolicy" NOT NULL DEFAULT 'TOXIC_ONLY';
