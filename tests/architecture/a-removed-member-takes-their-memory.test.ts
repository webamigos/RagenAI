import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Personal memory A5: a member who is removed from an organization, or leaves
 * it, takes their memory profile with them, in the delete's own transaction.
 *
 * No Better Auth hook covers every way a membership ends (spec A0) — leave,
 * the panel's `removeMember` and apps/admin's removal call none — so it is one
 * trigger on `members`, a guarantee no application test can reach because it
 * lives in the database. This pins its shape, and that no later migration
 * takes it away; the behaviour was checked once against a real Postgres when
 * it was written (spec A5): a deleted membership, user and organization each
 * removed exactly their profiles, with the memories and changes under them.
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

describe('a removed member takes their memory', () => {
  const migrations = allMigrationSql();
  const creating = migrations.filter((m) =>
    /CREATE TRIGGER "members_delete_memory_profile"/.test(m.sql),
  );

  it('is created by exactly one migration, after every row delete on members', () => {
    expect(creating).toHaveLength(1);
    expect(normalise(creating[0]!.sql)).toMatch(
      /CREATE TRIGGER "members_delete_memory_profile" AFTER DELETE ON "members" FOR EACH ROW EXECUTE FUNCTION "user_memory_profiles_delete_for_member"\(\)/,
    );
  });

  it('deletes only this member’s profile in this organization', () => {
    const sql = normalise(creating[0]!.sql);
    const del = sql.slice(sql.indexOf('DELETE FROM "user_memory_profiles"'));
    // Both halves: the same user's profile in another org survives.
    expect(del).toMatch(/"organization_id" = OLD\."organization_id"/);
    expect(del).toMatch(/"user_id" = OLD\."user_id"/);
  });

  it('reaches memories and changes through the profile’s cascade', () => {
    const tables = migrations.map((m) => normalise(m.sql)).join('\n');
    for (const table of ['user_memories', 'user_memory_changes']) {
      expect(tables, table).toMatch(
        new RegExp(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_profile_id_fkey" FOREIGN KEY \\("profile_id"\\) REFERENCES "user_memory_profiles"\\("id"\\) ON DELETE CASCADE`,
        ),
      );
    }
  });

  it('is not dropped by any later migration', () => {
    const after = migrations.slice(
      migrations.findIndex((m) => m.name === creating[0]!.name) + 1,
    );
    for (const m of after) {
      expect(m.sql, m.name).not.toMatch(
        /DROP (TRIGGER|FUNCTION)[^;]*(members_delete_memory_profile|user_memory_profiles_delete_for_member)/,
      );
    }
  });
});
