-- CreateEnum
CREATE TYPE "AiUsageStep" AS ENUM ('MODERATION', 'CHAT_COMPLETION', 'REPHRASING', 'EMBEDDINGS');

-- CreateTable
CREATE TABLE "ai_usages" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" TEXT NOT NULL,
    "project_id" INTEGER,
    "thread_id" UUID,
    "user_id" TEXT,
    "step" "AiUsageStep" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_usages_public_id_key" ON "ai_usages"("public_id");

-- CreateIndex
CREATE INDEX "ai_usages_organization_id_idx" ON "ai_usages"("organization_id");

-- CreateIndex
CREATE INDEX "ai_usages_project_id_idx" ON "ai_usages"("project_id");

-- CreateIndex
CREATE INDEX "ai_usages_user_id_idx" ON "ai_usages"("user_id");

-- CreateIndex
CREATE INDEX "ai_usages_created_at_idx" ON "ai_usages"("created_at");

-- CreateIndex
CREATE INDEX "ai_usages_step_idx" ON "ai_usages"("step");

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "internal_organizations"("provider_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
