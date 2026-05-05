-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "pii_ingestion_mode" TEXT DEFAULT 'destructive';
ALTER TABLE "organization_settings" ADD COLUMN "encrypted_pii_dek" TEXT;
