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

const DELETION_PATHS = [
  'apps/api/src/threads/thread-core.service.ts',
  'apps/worker/src/services/db/db.ts',
];

describe('thread deletion removes messages', () => {
  const behaviour = threadForeignKeyBehaviour(migrationSql());

  it('finds the constraint, so a changed migration name cannot pass vacuously', () => {
    expect(behaviour).toBeDefined();
  });

  it('is still ON DELETE SET NULL, which is why the manual deletes exist', () => {
    expect(
      behaviour,
      `messages_thread_id_fkey is now "ON DELETE ${behaviour}". If it cascades, the explicit message deletes in ${DELETION_PATHS.join(' and ')} are redundant and should be removed together with this test.`,
    ).toBe('SET NULL');
  });

  it.each(DELETION_PATHS)('%s deletes messages as well as threads', (path) => {
    const source = readFileSync(join(REPO_ROOT, path), 'utf8');

    // Both paths name the messages table/model in the delete they perform.
    // Crude on purpose: the point is that a future rewrite that drops the
    // message delete trips this, not that the query looks a particular way.
    const deletesThreads =
      /delete|del\(\)/i.test(source) && /thread/i.test(source);
    const deletesMessages = /message/i.test(source);

    expect(deletesThreads).toBe(true);
    expect(
      deletesMessages,
      `${path} deletes threads but never mentions messages. Because messages_thread_id_fkey is ON DELETE SET NULL, that leaves them orphaned with encrypted content and no key.`,
    ).toBe(true);
  });
});
