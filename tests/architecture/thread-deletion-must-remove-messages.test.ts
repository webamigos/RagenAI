import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Deleting a thread does not delete its messages, and every deletion path has
 * to compensate by hand.
 *
 * `0_init` declares the foreign key as `ON DELETE SET NULL`, so removing a
 * thread *detaches* its messages instead of removing them. The rows survive
 * holding their encrypted content while `threads.encrypted_dek` — the only key
 * that could ever read them — goes away with the thread. Permanently
 * unreadable rows, and for the nightly demo cleanup they would accumulate
 * every night.
 *
 * This is a tripwire in both directions:
 *
 * - If someone changes the constraint to `ON DELETE CASCADE`, this fails and
 *   names the two paths whose manual message deletes can then be dropped.
 * - If it stays `SET NULL`, the assertion below keeps the reason visible to
 *   whoever writes the third deletion path — the demo-environment spec
 *   asserted the cascade existed, which is how this was nearly shipped wrong.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function migrationSql(): string {
  const dir = join(REPO_ROOT, 'prisma', 'migrations');
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return readFileSync(join(dir, entry.name, 'migration.sql'), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

/** The last statement wins — a later migration can redefine the constraint. */
function threadForeignKeyBehaviour(sql: string): string | undefined {
  const matches = [
    ...sql.matchAll(
      /ADD CONSTRAINT "messages_thread_id_fkey"[\s\S]*?ON DELETE (\w+(?: \w+)?)/g,
    ),
  ];
  return matches.at(-1)?.[1];
}

/**
 * Each path, with the pattern that proves it *performs* a message deletion
 * rather than merely mentioning messages.
 *
 * A bare /message/i passed on this file's own prose: remove
 * `trx('messages').del()` from the worker and the word "messages" survives in
 * the docblock explaining why that delete has to be there, so the guard went
 * on passing while guarding nothing. Confirmed by mutating the source before
 * replacing it.
 */
const DELETION_PATHS: { path: string; deletesMessages: RegExp }[] = [
  {
    path: 'apps/api/src/threads/thread-core.service.ts',
    deletesMessages: /\.message\.deleteMany\s*\(/,
  },
  {
    // Was a knex pattern — `('messages') … .del(` — until ADR-40 moved this
    // deletion to Prisma. The guard failed loudly at that point, which is what
    // it is for; the two paths now share an idiom, and the shapes they match
    // are what differs between them rather than the question they ask.
    path: 'apps/worker/src/services/db/db.ts',
    deletesMessages: /\.message\.deleteMany\s*\(/,
  },
];

describe('thread deletion removes messages', () => {
  const behaviour = threadForeignKeyBehaviour(migrationSql());
  const paths = DELETION_PATHS.map(({ path }) => path);

  it('finds the constraint, so a changed migration name cannot pass vacuously', () => {
    expect(behaviour).toBeDefined();
  });

  it('is still ON DELETE SET NULL, which is why the manual deletes exist', () => {
    expect(
      behaviour,
      `messages_thread_id_fkey is now "ON DELETE ${behaviour}". If it cascades, the explicit message deletes in ${paths.join(' and ')} are redundant and should be removed together with this test.`,
    ).toBe('SET NULL');
  });

  it.each(DELETION_PATHS)(
    '$path performs a message deletion, not just a mention',
    ({ path, deletesMessages }) => {
      const source = readFileSync(join(REPO_ROOT, path), 'utf8');

      expect(
        deletesMessages.test(source),
        `${path} does not perform a message deletion matching ${deletesMessages}. Because messages_thread_id_fkey is ON DELETE SET NULL, deleting a thread without deleting its messages leaves them orphaned — holding encrypted content while the only key that could read it goes away with the thread row.`,
      ).toBe(true);
    },
  );

  /**
   * The guard on the guard. A pattern that keeps matching after its target is
   * removed is matching something else in the file, which is how the previous
   * version of this test came to pass vacuously.
   */
  it.each(DELETION_PATHS)(
    '$path: the pattern stops matching once its target is removed',
    ({ path, deletesMessages }) => {
      const source = readFileSync(join(REPO_ROOT, path), 'utf8');

      expect(deletesMessages.test(source.replace(deletesMessages, ''))).toBe(
        false,
      );
    },
  );
});
