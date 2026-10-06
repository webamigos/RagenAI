-- ADR-54: an explicit, confirmed link between two files of one organization.
CREATE TABLE "document_pairs" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_a_id" UUID NOT NULL,
    "file_b_id" UUID NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pairs_pkey" PRIMARY KEY ("id"),
    -- One representation per pair, and no file paired with itself.
    CONSTRAINT "document_pairs_ordered_check" CHECK ("file_a_id" < "file_b_id")
);

CREATE UNIQUE INDEX "document_pairs_id_organization_id_key" ON "document_pairs"("id", "organization_id");
CREATE UNIQUE INDEX "document_pairs_file_a_id_key" ON "document_pairs"("file_a_id");
CREATE UNIQUE INDEX "document_pairs_file_b_id_key" ON "document_pairs"("file_b_id");
CREATE INDEX "document_pairs_organization_id_idx" ON "document_pairs"("organization_id");

ALTER TABLE "document_pairs" ADD CONSTRAINT "document_pairs_file_a_id_organization_id_fkey" FOREIGN KEY ("file_a_id", "organization_id") REFERENCES "user_files"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_pairs" ADD CONSTRAINT "document_pairs_file_b_id_organization_id_fkey" FOREIGN KEY ("file_b_id", "organization_id") REFERENCES "user_files"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per paired file. The primary key is what makes "a file is in at most
-- one pair" a database rule across both columns above.
CREATE TABLE "document_pair_members" (
    "file_id" UUID NOT NULL,
    "pair_id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "document_pair_members_pkey" PRIMARY KEY ("file_id")
);

CREATE UNIQUE INDEX "document_pair_members_file_id_organization_id_key" ON "document_pair_members"("file_id", "organization_id");
CREATE INDEX "document_pair_members_pair_id_idx" ON "document_pair_members"("pair_id");

ALTER TABLE "document_pair_members" ADD CONSTRAINT "document_pair_members_file_id_organization_id_fkey" FOREIGN KEY ("file_id", "organization_id") REFERENCES "user_files"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_pair_members" ADD CONSTRAINT "document_pair_members_pair_id_organization_id_fkey" FOREIGN KEY ("pair_id", "organization_id") REFERENCES "document_pairs"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
