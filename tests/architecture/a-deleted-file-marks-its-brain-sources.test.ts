import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Ragen Brain E5: deleting a document marks the citations that pointed at
 * it, in the delete's own transaction, for every path that deletes a file.
 * That is one trigger on `user_files` — a guarantee no application test can
 * reach, because it lives in the database. This pins its shape, and that no
 * later migration takes it away; the behaviour was checked once against a
 * real Postgres when it was written (spec E5).
 */
const MIGRATIONS = join(
  import.meta.dirname,
  '..',
  '..',
  'prisma',
  'migrations',
);

function allMigrationSql(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'),
    }));
}

const normalise = (sql: string) => sql.replace(/\s+/g, ' ');

describe('a deleted file marks its Brain sources', () => {
  const migrations = allMigrationSql();
  const creating = migrations.filter((m) =>
    /CREATE TRIGGER "user_files_mark_brain_sources_deleted"/.test(m.sql),
  );

  it('is created by exactly one migration, after every row delete on user_files', () => {
    expect(creating).toHaveLength(1);
    expect(normalise(creating[0]!.sql)).toMatch(
      /CREATE TRIGGER "user_files_mark_brain_sources_deleted" AFTER DELETE ON "user_files" FOR EACH ROW EXECUTE FUNCTION "knowledge_page_sources_mark_file_deleted"\(\)/,
    );
  });

  it('marks only this file’s sources in this organization, and only once', () => {
    const sql = normalise(creating[0]!.sql);
    const update = sql.slice(sql.indexOf('UPDATE "knowledge_page_sources"'));
    expect(update).toMatch(/"file_id" = OLD\."id"/);
    // Tenant-scoped even inside the database.
    expect(update).toMatch(/"organization_id" = OLD\."organization_id"/);
    // Idempotent: a source already marked keeps its first timestamp.
    expect(update).toMatch(/"source_deleted_at" IS NULL/);
  });

  it('is not dropped by any later migration', () => {
    const after = migrations.slice(
      migrations.findIndex((m) => m.name === creating[0]!.name) + 1,
    );
    for (const m of after) {
      expect(m.sql, m.name).not.toMatch(
        /DROP (TRIGGER|FUNCTION)[^;]*(user_files_mark_brain_sources_deleted|knowledge_page_sources_mark_file_deleted)/,
      );
    }
  });
});
