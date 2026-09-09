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

ALTER TABLE "user_documents"
  ADD CONSTRAINT "user_documents_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
