-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "impersonated_by" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ban_expires" TIMESTAMPTZ,
ADD COLUMN     "ban_reason" TEXT,
ADD COLUMN     "banned" BOOLEAN DEFAULT false;
