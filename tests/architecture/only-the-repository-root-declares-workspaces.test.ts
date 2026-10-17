import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `apps/api` finds the repository root — and with it the shared `.env.local`
 * — by walking up to the first `package.json` that declares `workspaces`
 * (`apps/api/src/config/load-local-env.ts`). That only works while exactly
 * one manifest declares them.
 *
 * The walk has already broken twice on a marker that later appeared one
 * directory down: first a stale `apps/api/package-lock.json`, then the
 * package-level `turbo.json` each app gained in #1574. Both times the walk
 * stopped at `apps/api`, the root `.env.local` went unread, and
 * `npm run api:dev` failed with a validation error naming a variable that
 * was sitting in the root file. Nothing else noticed, because a deployment
 * carries no `.env` files at all.
 *
 * npm does not support nested workspaces, so a second declaration would break
 * `npm install` too — but only for whoever runs it in that directory. This
 * makes it a red check for everyone.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Scoped like the lockfile guard: `.claude/` holds worktrees of this repo. */
const WORKSPACE_MANIFESTS = ['apps/*/package.json', 'packages/*/package.json'];

function declaresWorkspaces(file: string): boolean {
  const { workspaces } = JSON.parse(
    readFileSync(join(REPO_ROOT, file), 'utf8'),
  ) as { workspaces?: unknown };
  return workspaces !== undefined && workspaces !== null;
}

describe('only the repository root declares workspaces', () => {
  it('the root package.json declares them', () => {
    expect(declaresWorkspaces('package.json')).toBe(true);
  });

  it('no workspace package.json declares them', () => {
    const manifests = WORKSPACE_MANIFESTS.flatMap((pattern) =>
      globSync(pattern, { cwd: REPO_ROOT }),
    );
    // Guard on the guard: an empty sweep would pass by finding nothing.
    expect(manifests).toContain('apps/api/package.json');

    expect(
      manifests.filter(declaresWorkspaces).sort(),
      'apps/api walks up to the first package.json with `workspaces` to find ' +
        'the root .env.local; a second one stops the walk early. npm does not ' +
        'support nested workspaces either — remove the field.',
    ).toEqual([]);
  });
});
