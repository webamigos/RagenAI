-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "allowed_templates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
