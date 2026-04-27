-- Add per-message structured metadata column (e.g. reasoningContent from
-- "Deep thinking" mode). Plaintext JSON — see schema.prisma for usage notes.
ALTER TABLE "messages" ADD COLUMN "metadata" JSONB;
