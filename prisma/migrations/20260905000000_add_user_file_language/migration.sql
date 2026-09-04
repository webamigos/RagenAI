-- Adds a per-document language tag, detected at ingest time by `franc` in
-- the Temporal worker and stored as an ISO 639-3 code. Nullable and
-- additive: existing rows (there are none in production yet) are
-- unaffected, and nothing reads this column until a follow-up spec wires up
-- retrieval-time filtering.
ALTER TABLE "user_files" ADD COLUMN "language" TEXT;
