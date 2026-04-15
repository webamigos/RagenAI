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
    -- Defensive default so raw INSERTs (outside the Prisma client) don't
    -- fail. The Prisma client still sets this on every write via @updatedAt,
    -- so the default is effectively only a safety net.
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Partial unique indexes: (org, nip) and (org, krs) are only unique when
-- the nullable side is populated. Without WHERE clauses, Postgres treats
-- every NULL as distinct so the constraint is effectively meaningless —
-- but it also blocks multiple NULLs in some adapter paths. Explicit
-- partial indexes make the intent clear and safe.
CREATE UNIQUE INDEX "leads_organization_id_nip_key"
    ON "leads"("organization_id", "nip")
    WHERE "nip" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_krs_key"
    ON "leads"("organization_id", "krs")
    WHERE "krs" IS NOT NULL;

-- CreateIndex
CREATE INDEX "leads_organization_id_idx" ON "leads"("organization_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_pkd_main_idx" ON "leads"("organization_id", "pkd_main");

-- CreateIndex
CREATE INDEX "leads_organization_id_revenue_last_idx" ON "leads"("organization_id", "revenue_last");

-- CreateIndex
CREATE INDEX "leads_organization_id_enriched_at_idx" ON "leads"("organization_id", "enriched_at");
