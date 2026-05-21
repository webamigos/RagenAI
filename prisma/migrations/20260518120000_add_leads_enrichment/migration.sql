-- CreateEnum
CREATE TYPE "lead_enrichment_status" AS ENUM ('idle', 'pending', 'enriched', 'failed');

-- CreateEnum
CREATE TYPE "lead_enrichment_job_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "lead_lists" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lead_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "lead_list_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "enrichment_status" "lead_enrichment_status" NOT NULL DEFAULT 'idle',
    "enriched_at" TIMESTAMPTZ,
    "enrichment_error" TEXT,
    "row_index" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_enrichment_jobs" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "lead_list_id" INTEGER NOT NULL,
    "status" "lead_enrichment_job_status" NOT NULL DEFAULT 'pending',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "workflow_id" TEXT,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lead_enrichment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_lists_public_id_key" ON "lead_lists"("public_id");

-- CreateIndex
CREATE INDEX "lead_lists_organization_id_idx" ON "lead_lists"("organization_id");

-- CreateIndex
CREATE INDEX "lead_lists_created_by_id_idx" ON "lead_lists"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_public_id_key" ON "leads"("public_id");

-- CreateIndex
CREATE INDEX "leads_lead_list_id_row_index_idx" ON "leads"("lead_list_id", "row_index");

-- CreateIndex
CREATE INDEX "leads_lead_list_id_enrichment_status_idx" ON "leads"("lead_list_id", "enrichment_status");

-- CreateIndex
CREATE UNIQUE INDEX "lead_enrichment_jobs_public_id_key" ON "lead_enrichment_jobs"("public_id");

-- CreateIndex
CREATE INDEX "lead_enrichment_jobs_lead_list_id_idx" ON "lead_enrichment_jobs"("lead_list_id");

-- AddForeignKey
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_list_id_fkey" FOREIGN KEY ("lead_list_id") REFERENCES "lead_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_enrichment_jobs" ADD CONSTRAINT "lead_enrichment_jobs_lead_list_id_fkey" FOREIGN KEY ("lead_list_id") REFERENCES "lead_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
