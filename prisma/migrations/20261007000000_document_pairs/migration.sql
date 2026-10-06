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

-- A pair's endpoints are its members, and nothing else. Without this a pair
-- could be inserted with no member rows, or a file could be the smaller id in
-- one pair and the larger in another, and the member key above would never see
-- it. Checked at commit, because a pair and its members are written in one
-- transaction and neither exists first.
CREATE FUNCTION "document_pairs_check_members"() RETURNS trigger AS $$
BEGIN
    IF TG_TABLE_NAME = 'document_pairs' THEN
        IF NOT EXISTS (SELECT 1 FROM "document_pairs" WHERE "id" = NEW."id") THEN
            RETURN NULL;
        END IF;
        IF (SELECT count(*) FROM "document_pair_members"
            WHERE "pair_id" = NEW."id"
              AND "file_id" IN (NEW."file_a_id", NEW."file_b_id")) <> 2
           OR (SELECT count(*) FROM "document_pair_members"
               WHERE "pair_id" = NEW."id") <> 2 THEN
            RAISE EXCEPTION 'document pair % must have exactly its two files as members', NEW."id"
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM "document_pair_members" WHERE "file_id" = NEW."file_id") THEN
            RETURN NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM "document_pairs"
                       WHERE "id" = NEW."pair_id"
                         AND NEW."file_id" IN ("file_a_id", "file_b_id")) THEN
            RAISE EXCEPTION 'file % is not an endpoint of pair %', NEW."file_id", NEW."pair_id"
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "document_pairs_members_complete"
    AFTER INSERT OR UPDATE ON "document_pairs"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "document_pairs_check_members"();

CREATE CONSTRAINT TRIGGER "document_pair_members_are_endpoints"
    AFTER INSERT OR UPDATE ON "document_pair_members"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "document_pairs_check_members"();
