-- A document keeps its own owner, so its standing does not depend on a row
-- that can vanish.
--
-- `user_documents.file_id` is ON DELETE SET NULL, and `canAccessDocument` read
-- a null file as "no ownership signal, therefore org-wide". Deleting a private
-- file therefore published that document's decrypted content and its whole
-- version history to every member of the organization. It is not theoretical:
-- it flipped three of `p0-26`'s access-control assertions from 404 to 200 when
-- an unrelated delete test happened to pick the private fixture.
ALTER TABLE "user_documents" ADD COLUMN "owner_id" TEXT;

-- Backfill from the file the document was ingested from, which is where
-- ownership lives today. Documents whose file is already gone cannot be
-- recovered — nothing records who owned it — so they stay null, which means
-- org-wide, which is what they are today. This does not widen anything.
UPDATE "user_documents" d
SET "owner_id" = f."owner_id"
FROM "user_files" f
WHERE d."file_id" = f."id"
  AND f."owner_id" IS NOT NULL;

CREATE INDEX "user_documents_owner_id_idx" ON "user_documents"("owner_id");

-- No foreign key, on purpose. Every referential action available gets this
-- wrong: ON DELETE SET NULL would turn "owned by someone who no longer exists"
-- into "unowned", which reads as org-wide — the same widening this migration
-- exists to close, arriving through user deletion instead of file deletion.
-- RESTRICT would block deleting a user; CASCADE would delete their colleagues'
-- documents. An authorization attribute has to outlive the row it names, so a
-- deleted owner leaves an id nobody matches and the document stays private.

