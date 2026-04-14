-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "multi_query_enabled" BOOLEAN;
ALTER TABLE "organization_settings" ADD COLUMN "doc_summaries_enabled" BOOLEAN;
ALTER TABLE "organization_settings" ADD COLUMN "content_moderation_enabled" BOOLEAN;
ALTER TABLE "organization_settings" ADD COLUMN "reranking_enabled" BOOLEAN;
