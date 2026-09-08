import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * One lockfile, at the root, because that is the only one npm reads.
 *
 * `apps/api` carried its own `package-lock.json` from before ADR-21 folded the
 * standalone `ragen-api` repository into this workspace. npm workspaces
 * resolve from the root lockfile, so the file installed nothing and pinned
 * nothing — it was inert, and ADR-26 recorded it as such with "delete it when
 * convenient".
 *
 * Inert is not harmless. By the time it went it was missing 26 of the 81
 * dependencies `apps/api/package.json` declares — every AI SDK, AWS SDK and
 * OpenTelemetry package added since the merge — still listed one that had been
 * removed, and disagreed with five version ranges, naming `prisma@^7.0.0`
 * where the app asks for `^7.10.0`. Anyone opening it to answer "which version
 * does the API actually use" got a confident, wrong answer, and a
 * dependency-upgrade skill that reads a lockfile to find the installed version
 * would have read that one.
 *
 * A second lockfile also silently changes CI: `hashFiles('**\/package-lock.json')`
 * keys the node_modules cache in `.github/actions/setup-workspace` and three
 * workflows, so a stale file nobody edits still participates in every cache
 * key.
 *
 * The failure this guards is not someone re-adding the file on purpose. It is
 * `npm install` run from inside a workspace directory, or the next repository
 * absorbed the way ADR-21 and ADR-26 absorbed these — a plain file copy, where
 * the lockfile comes along with everything else. It happened once already
 * (docs/lessons/monorepo-absorption-discards-the-lockfile.md is the other half
 * of the same story) and nothing but this test would notice.
 *
 * The root's own `package-lock.json` is the point of the rule, so it is not
 * matched here.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Every lockfile format a stray `install` could leave behind. */
const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
] as const;

/**
 * Scoped to the workspace directories rather than the whole tree: `.claude/`
 * holds worktrees of this same repository, each with a legitimate root
 * lockfile of its own, and a bare `**` sweep would report all of them.
 */
const WORKSPACE_GLOBS = LOCKFILES.flatMap((name) => [
  `apps/*/${name}`,
  `packages/*/${name}`,
]);

function strayLockfiles(): string[] {
  return WORKSPACE_GLOBS.flatMap((pattern) =>
    globSync(pattern, { cwd: REPO_ROOT }),
  ).sort();
}

describe('only the repository root has a lockfile', () => {
  it('finds the root lockfile, so the sweep is looking at a real checkout', () => {
    // Guard on the guard: if the working directory were wrong, the assertion
    // below would pass by finding nothing at all.
    const root = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'),
    );

    expect(root.packages['apps/api']).toBeDefined();
    expect(root.packages['apps/web']).toBeDefined();
  });

  it('no workspace carries a lockfile of its own', () => {
    expect(
      strayLockfiles(),
      'npm workspaces install from the root lockfile, so this one pins nothing ' +
        'and drifts from its own package.json unnoticed. Delete it and run ' +
        '`npm install` at the repository root instead.',
    ).toEqual([]);
  });

  it('would catch a lockfile in a workspace, in any format', () => {
    // The mutation, against the patterns rather than the filesystem, so the
    // sweep above cannot start passing vacuously if the globs are narrowed.
    const patterns = new Set(WORKSPACE_GLOBS);

    expect(patterns.has('apps/*/package-lock.json')).toBe(true);
    expect(patterns.has('apps/*/yarn.lock')).toBe(true);
    expect(patterns.has('packages/*/pnpm-lock.yaml')).toBe(true);
    expect(patterns.has('packages/*/bun.lockb')).toBe(true);
    // Every format, in both workspace roots, and nothing else.
    expect(patterns.size).toBe(LOCKFILES.length * 2);
  });
});
