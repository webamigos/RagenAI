-- AlterTable
ALTER TABLE "project_settings" ADD COLUMN "enabled_mcp_providers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
