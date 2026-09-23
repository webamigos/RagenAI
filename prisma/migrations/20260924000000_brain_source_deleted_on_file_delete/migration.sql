-- Ragen Brain E5: a deleted document leaves its citations dangling, visibly.
--
-- `knowledge_page_sources.file_id` has no foreign key, deliberately (the
-- schema says why: every referential action loses the provenance). So
-- something has to mark a source whose file is gone, and it has to happen in
-- the delete's own transaction. A trigger does, for every path that deletes a
-- file — the web's single and folder deletes, apps/api's file and project
-- deletes, and any bulk path added later — where five copies of the same
-- update would each be one refactor away from being forgotten.
--
-- Idempotent: a source already marked keeps its first timestamp. The
-- reconciliation sweep in the worker covers files deleted before this
-- migration, and anything that bypassed it.

CREATE FUNCTION "knowledge_page_sources_mark_file_deleted"() RETURNS trigger AS $$
BEGIN
  UPDATE "knowledge_page_sources"
     SET "source_deleted_at" = now()
   WHERE "file_id" = OLD."id"
     AND "organization_id" = OLD."organization_id"
     AND "source_deleted_at" IS NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "user_files_mark_brain_sources_deleted"
  AFTER DELETE ON "user_files"
  FOR EACH ROW EXECUTE FUNCTION "knowledge_page_sources_mark_file_deleted"();
