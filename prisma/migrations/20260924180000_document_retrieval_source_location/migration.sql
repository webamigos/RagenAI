-- Where a retrieved chunk sits in its document, kept per turn so a reopened
-- thread opens a cited source at the page it came from, with its paragraphs
-- outlined, the way the live turn did.
--
-- Both nullable and without a default: every existing row predates them and
-- has no way to recover the values (Qdrant chunk ids do not survive a
-- re-index), and the viewers fall back to finding the passage from `snippet`.
-- Adding a nullable column with no default is a catalog-only change in
-- Postgres, so this does not rewrite the table.

ALTER TABLE "document_retrievals"
  ADD COLUMN "source_page" INTEGER,
  ADD COLUMN "source_regions" JSONB;
