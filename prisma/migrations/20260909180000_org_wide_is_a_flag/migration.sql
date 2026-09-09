-- "Shared with the whole organization" becomes a flag instead of a null owner.
--
-- `owner_id IS NULL` meant two things at once: an org admin shared this with
-- everyone, and nobody owns this. The owner foreign key is ON DELETE SET NULL,
-- so deleting a user rewrote every private file and folder they owned into the
-- first meaning. Every access predicate admits `ownerId: null` to the whole
-- organization, so their content became readable by every member.
--
-- The backfill preserves today's behaviour exactly: everything that reads as
-- org-wide right now is marked org-wide. Nothing widens, nothing narrows.
ALTER TABLE "user_files" ADD COLUMN "is_org_wide" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "document_folders" ADD COLUMN "is_org_wide" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_files" SET "is_org_wide" = true WHERE "owner_id" IS NULL;
UPDATE "document_folders" SET "is_org_wide" = true WHERE "owner_id" IS NULL;
