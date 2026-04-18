-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "allowed_connectors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
