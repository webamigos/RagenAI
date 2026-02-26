-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "storage_limit_bytes" BIGINT;
ALTER TABLE "organization_settings" ADD COLUMN "project_storage_limit_bytes" BIGINT;
ALTER TABLE "organization_settings" ADD COLUMN "single_file_limit_bytes" BIGINT;
