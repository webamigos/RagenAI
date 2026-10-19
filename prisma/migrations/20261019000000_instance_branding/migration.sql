-- Spec 2026-10-17-ragen-as-an-on-premises-appliance, B2: the install's own
-- product name, logo and palette. Additive: one new table, no existing table
-- changes, so an older app runs on this schema unchanged (the spec's
-- rollback rule). No row means today's Ragen branding.
CREATE TABLE "instance_branding" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "product_name" TEXT,
    "logo_storage_key" TEXT,
    "primary_token" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "instance_branding_pkey" PRIMARY KEY ("id"),
    -- A single row, as a database rule rather than a convention: the app
    -- always upserts id 1, and nothing else can insert a second one.
    CONSTRAINT "instance_branding_single_row_check" CHECK ("id" = 1)
);
