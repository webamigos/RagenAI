-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "access_token_expires_at" TIMESTAMPTZ,
ADD COLUMN     "scope" TEXT;
