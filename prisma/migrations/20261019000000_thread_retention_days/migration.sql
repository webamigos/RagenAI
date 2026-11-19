-- Per-organization thread retention (spec 2026-10-17, B4). Null is off, which
-- is every existing row: nothing is deleted until an owner or admin chooses a
-- period. Additive, so an older client keeps reading the table.
ALTER TABLE "organization_settings" ADD COLUMN "thread_retention_days" INTEGER;
