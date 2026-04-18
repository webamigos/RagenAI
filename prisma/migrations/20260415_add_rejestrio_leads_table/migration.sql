-- CreateTable
CREATE TABLE "rejestrio_leads" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "nip" TEXT,
    "krs" INTEGER,
    "company_name" TEXT,
    "pkd_main" TEXT,
    "pkd_category" TEXT,
    "forma_prawna" TEXT,
    "revenue_last" DOUBLE PRECISION,
    "profit_last" DOUBLE PRECISION,
    "revenue_rocznik" INTEGER,
    "employee_size" TEXT,
    "is_bankrupt" BOOLEAN,
    "is_liquidation" BOOLEAN,
    "is_wykreslona" BOOLEAN,
    "is_na_gpw" BOOLEAN,
    "enriched_at" TIMESTAMPTZ,
    "enrichment_source" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rejestrio_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Plain unique indexes (not partial). Postgres's default behaviour
-- treats NULL as distinct in unique indexes, so (org_id, NULL) rows
-- don't collide with each other automatically — no WHERE clause
-- needed, and Prisma's `@@unique` can express this shape natively
-- with no schema-vs-DB drift.
CREATE UNIQUE INDEX "rejestrio_leads_organization_id_nip_key" ON "rejestrio_leads"("organization_id", "nip");

-- CreateIndex
CREATE UNIQUE INDEX "rejestrio_leads_organization_id_krs_key" ON "rejestrio_leads"("organization_id", "krs");

-- CreateIndex
CREATE INDEX "rejestrio_leads_organization_id_idx" ON "rejestrio_leads"("organization_id");

-- CreateIndex
CREATE INDEX "rejestrio_leads_organization_id_pkd_main_idx" ON "rejestrio_leads"("organization_id", "pkd_main");

-- CreateIndex
CREATE INDEX "rejestrio_leads_organization_id_revenue_last_idx" ON "rejestrio_leads"("organization_id", "revenue_last");

-- CreateIndex
CREATE INDEX "rejestrio_leads_organization_id_enriched_at_idx" ON "rejestrio_leads"("organization_id", "enriched_at");
