import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './tracked-files';

/**
 * `docs/architecture.md` answers "where does this belong" before someone writes
 * code, so what it leaves out is what gets duplicated: absence from the map
 * reads as absence from the repo.
 *
 * It listed ten feature modules while `apps/web/src/features/` held nineteen,
 * then twenty-four; it listed `packages/db` and `apps/docs` long after both
 * were gone and never listed `apps/mcp` or nine of the packages (#1138, #1139).
 * Nothing failed, because a directory tree in prose is tested by nothing that
 * reads code.
 *
 * One direction only, as the issue asks: every directory that exists is named
 * in the tree. Documenting something that was just deleted is a harmless state
 * for one commit; omitting something that was just added is the failure.
 */

const doc = readFileSync(join(REPO_ROOT, 'docs', 'architecture.md'), 'utf8');

function directories(dir: string): string[] {
  return readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => name !== 'node_modules');
}

/** A tree entry: `├── name/` or `└── name/`, so `jobs` is not satisfied by `jobs-bullmq/`. */
function inTree(name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`[├└]── ${escaped}/`).test(doc);
}

describe('every module is in the architecture doc', () => {
  it.each([
    ['apps/web/src/features', 'a feature module'],
    ['apps', 'an application'],
    ['packages', 'a package'],
  ] as const)('%s: every directory is named in the tree', (dir, what) => {
    const names = directories(dir);

    // A guard that found nothing to check has stopped working.
    expect(names.length).toBeGreaterThanOrEqual(3);

    const missing = names.filter((name) => !inTree(name));

    expect(
      missing,
      `${dir}/ has ${what} that docs/architecture.md does not list. Add a line to its tree, in the style of the entries around it.`,
    ).toEqual([]);
  });
});
