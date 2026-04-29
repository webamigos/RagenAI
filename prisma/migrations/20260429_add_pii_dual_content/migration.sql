-- AlterTable: add pii_ingestion_mode and encrypted_pii_dek to organization_settings
ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "pii_ingestion_mode" TEXT DEFAULT 'destructive',
  ADD COLUMN IF NOT EXISTS "encrypted_pii_dek"  TEXT;
