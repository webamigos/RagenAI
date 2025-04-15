/*
  Warnings:

  - You are about to drop the column `embedded_at` on the `UserFile` table. All the data in the column will be lost.
  - You are about to drop the column `is_embedded` on the `UserFile` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "EmbeddingStatus" AS ENUM ('NOT_STARTED', 'STARTED', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "UserFile" DROP COLUMN "embedded_at",
DROP COLUMN "is_embedded",
ADD COLUMN     "embedding_completed_at" TIMESTAMPTZ,
ADD COLUMN     "embedding_failed_at" TIMESTAMPTZ,
ADD COLUMN     "embedding_started_at" TIMESTAMPTZ,
ADD COLUMN     "embedding_status" "EmbeddingStatus" NOT NULL DEFAULT 'NOT_STARTED';
