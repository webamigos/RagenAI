-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "allowed_models" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "budget_duration" TEXT NOT NULL DEFAULT '30d',
ADD COLUMN     "budget_usd_cents" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "last_alert_threshold" INTEGER,
ADD COLUMN     "litellm_key_token" TEXT,
ADD COLUMN     "litellm_team_id" TEXT,
ADD COLUMN     "rpm_limit" INTEGER,
ADD COLUMN     "tpm_limit" INTEGER;
