-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "monthly_cost_limit_cents" INTEGER,
ADD COLUMN     "monthly_message_limit" INTEGER,
ADD COLUMN     "monthly_token_limit" BIGINT;
