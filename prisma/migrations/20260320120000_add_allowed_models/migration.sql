-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "allowed_models" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
