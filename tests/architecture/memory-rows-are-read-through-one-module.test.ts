import { describe, expect, it } from 'vitest';

import { readSource, trackedPaths } from './tracked-files';

/**
 * Personal memory's boundary is the (organization, user) pair, and only half
 * of it is visible to anything automatic: the tenant-scope guard sees a
 * missing `organizationId` (and only warns), and nothing sees a missing
 * `userId`. A query that forgets the user returns a colleague's memories —
 * what they told the chat about themselves — with every check green.
 *
 * So the three models are reached through one module per app (spec
 * 2026-09-27-personal-memory-across-threads, "The per-user boundary is
 * enforced in one place"):
 *
 * - apps/web: `features/memory/services/memory-scope.ts`, whose functions take
 *   a `MemoryOwner` built only from the session;
 * - apps/worker: the memory activity module, `src/activities/memory/`.
 *
 * Their own tests may touch the models to assert on them. Anything else that
 * names a model's Prisma delegate fails here.
 */
const DELEGATE = /\.(?:userMemoryProfile|userMemoryChange|userMemory)\b/;

/**
 * The other two ways to reach the rows without the delegate: through
 * `Thread`'s relations (`include: { memories: true }` reads every user's
 * memories in a thread, with no `userId` anywhere), and raw SQL on the
 * tables.
 */
const RELATION = /\b(?:memories|memoryChanges)\s*:\s*(?:true|\{)/;
const TABLE = /\buser_memor(?:y_profiles|ies|y_changes)\b/;

const ALLOWED_PREFIXES = [
  'apps/web/src/features/memory/services/memory-scope.ts',
  'apps/web/src/features/memory/services/__tests__/',
  'apps/worker/src/activities/memory/',
  // The e2e job starts no worker, so nothing can extract a memory there: the
  // spec seeds the rows it then reads through the app, and the seed clears
  // them for the test orgs. Neither is code a request runs.
  'apps/web/e2e/p0-35-personal-memory.spec.ts',
  'apps/web/e2e/seed/e2e-seed.ts',
];

const SOURCES = trackedPaths().filter(
  (path) =>
    (path.startsWith('apps/') || path.startsWith('packages/')) &&
    /\.(?:ts|tsx|mts|cts)$/.test(path) &&
    !path.includes('/generated/') &&
    !path.includes('/node_modules/'),
);

describe('memory rows are read through one module', () => {
  it('scans the source tree, so it cannot pass on an empty sweep', () => {
    expect(SOURCES.length).toBeGreaterThan(500);
  });

  it('finds the models in the module that owns them', () => {
    expect(
      DELEGATE.test(
        readSource('apps/web/src/features/memory/services/memory-scope.ts'),
      ),
    ).toBe(true);
  });

  it('finds them nowhere else', () => {
    const offenders = SOURCES.filter(
      (path) => !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)),
    ).filter((path) => {
      const source = readSource(path);
      return (
        DELEGATE.test(source) || RELATION.test(source) || TABLE.test(source)
      );
    });

    expect(
      offenders,
      [
        'A personal-memory model is queried outside its scope module.',
        '',
        'Go through apps/web/src/features/memory/services/memory-scope.ts',
        '(or the worker’s activities/memory/ module): its functions take a',
        'MemoryOwner built from the session, which is the only thing that',
        'holds the per-user half of the boundary.',
      ].join('\n'),
    ).toEqual([]);
  });
});

/**
 * The org admin's scope deletes every member's memories and may ask whether
 * any exist; it must never be a way to read one (spec, B3). Checked on the
 * code between the scope's markers, comments stripped, so a `select` of the
 * memory's text or a filter on a member is caught where it would be added.
 */
describe('the org admin memory scope', () => {
  const source = readSource(
    'apps/web/src/features/memory/services/memory-scope.ts',
  );
  const begin = source.indexOf('// --- OrgMemoryAdmin: begin');
  const end = source.indexOf('// --- OrgMemoryAdmin: end');

  it('is marked in the scope module', () => {
    expect(begin).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(begin);
  });

  it('reads no content and names no user', () => {
    const code = source
      .slice(begin, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bcontent\b/);
    expect(code).not.toMatch(/\buserId\b/);
    expect(code).toMatch(/export async function deleteAllOrgMemories\b/);
  });
});
