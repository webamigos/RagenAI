-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "storage_limit_bytes" BIGINT;
ALTER TABLE "organization_settings" ADD COLUMN "project_storage_limit_bytes" BIGINT;
ALTER TABLE "organization_settings" ADD COLUMN "single_file_limit_bytes" BIGINT;

-- Add CHECK constraints to ensure non-negative values
ALTER TABLE "organization_settings" ADD CONSTRAINT "chk_storage_limit_bytes" CHECK ("storage_limit_bytes" > 0);
ALTER TABLE "organization_settings" ADD CONSTRAINT "chk_project_storage_limit_bytes" CHECK ("project_storage_limit_bytes" > 0);
ALTER TABLE "organization_settings" ADD CONSTRAINT "chk_single_file_limit_bytes" CHECK ("single_file_limit_bytes" > 0);
