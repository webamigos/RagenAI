-- The fragment behind a citation, kept per turn.
--
-- Nullable rather than defaulted: rows written before this have no snippet and
-- never will. A source card renders a quote when there is one and omits it
-- otherwise, so an old row degrades to what it always showed rather than
-- displaying an empty quote.
--
-- The column holds ciphertext whenever the deployment has thread encryption
-- on, under the same DEK as the message the retrieval belongs to.
ALTER TABLE "document_retrievals" ADD COLUMN "snippet" TEXT;
