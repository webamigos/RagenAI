-- CreateTable
CREATE TABLE "leads" (
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

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_nip_key" ON "leads"("organization_id", "nip");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_krs_key" ON "leads"("organization_id", "krs");

-- CreateIndex
CREATE INDEX "leads_organization_id_idx" ON "leads"("organization_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_pkd_main_idx" ON "leads"("organization_id", "pkd_main");

-- CreateIndex
CREATE INDEX "leads_organization_id_revenue_last_idx" ON "leads"("organization_id", "revenue_last");

-- CreateIndex
CREATE INDEX "leads_organization_id_enriched_at_idx" ON "leads"("organization_id", "enriched_at");
