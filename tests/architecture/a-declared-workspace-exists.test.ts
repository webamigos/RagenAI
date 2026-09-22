import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A workspace that three applications depend on and that is not in the tree.
 *
 * #1194 retired the LiteLLM path (ADR-49, B6) and deleted
 * `packages/litellm-client/package.json` and its `src/`. Three things stayed:
 * twenty compiled files under `dist/`, which were tracked because the root
 * `.gitignore`'s `/dist` is root-anchored and never covered a package's own;
 * `"@ragenai/litellm-client": "*"` in `apps/web`, `apps/api` and `apps/admin`;
 * and the matching entries in `package-lock.json`, which went on naming
 * `packages/litellm-client` as a workspace.
 *
 * Nothing said so, for a week, and the reason is the opposite of the obvious
 * guess: **`npm ci` never fails on this.** Both configurations were measured
 * on a real clone, not reasoned about.
 *
 * With the tracked `dist/` present, npm links the directory from the lockfile
 * entry without ever asking it for a manifest. Exit 0, and the string
 * `litellm-client` appears nowhere in the output. With the directory removed
 * entirely — which is what a checkout looks like once that ignored build
 * output stops being committed — npm links it anyway. Exit 0 again, equally
 * silent, and the result is a *dangling* symlink.
 *
 * So the install always succeeds and the package is never importable. Present:
 * `Cannot find package '.../index.js'`. Absent: `ERR_MODULE_NOT_FOUND`. Either
 * way the first report comes at runtime, from whichever process reached for
 * it, and it is inert today only because nothing does. The name is in three
 * manifests, which is where an editor's autocomplete reads from.
 *
 * That is the whole argument for a test. `npm run verify` never runs `npm ci`;
 * `npm ci` would not complain if it did; and the resolve error surfaces
 * somewhere with no connection to the manifest that caused it. Nothing in the
 * toolchain is positioned to notice, so the check has to be written down.
 *
 * The existing guards walked past it in the same direction. Both
 * `packages-build-in-dependency-order` and `lint-staged-covers-every-workspace`
 * enumerate `packages/*` and drop any directory whose `package.json` will not
 * parse — reasonable for a scratch directory, and exactly how a workspace with
 * no manifest becomes invisible rather than loud.
 *
 * So the rule, per AGENTS.md: **a workspace that something declares is a
 * workspace that exists.** It is checked from both directions, because they
 * fail apart. The manifests are the source of truth and catch the dangling
 * dependency the moment it is written; the lockfile is the generated artefact
 * and catches the half a forgotten `npm install` leaves behind.
 *
 * Related: `an-infra-path-that-is-cited-exists.test.ts` (#1297) is the same
 * shape one level down — a deletion complete in the code and nowhere else.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** The globs in the root `package.json`'s `workspaces`. */
const WORKSPACE_ROOTS = ['packages', 'apps'];

/** This repository's own scope. An external `@ragenai/*` does not exist. */
const SCOPE = '@ragenai/';

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

type Manifest = {
  name?: string;
  workspaces?: string[];
} & Partial<
  Record<(typeof DEPENDENCY_SECTIONS)[number], Record<string, string>>
>;

type Workspace = { path: string; manifest: Manifest };

function readManifest(relativePath: string): Manifest | undefined {
  try {
    return JSON.parse(
      readFileSync(join(REPO_ROOT, relativePath, 'package.json'), 'utf8'),
    ) as Manifest;
  } catch {
    return undefined;
  }
}

/**
 * Every directory under a workspace root, whether or not it has a manifest.
 *
 * Deliberately not `.filter(hasManifest)` — the directory that has none is the
 * thing being looked for, so dropping it here would reproduce the blind spot
 * this test exists to close.
 */
function workspaceDirectories(): string[] {
  const found: string[] = [];

  for (const root of WORKSPACE_ROOTS) {
    for (const entry of readdirSync(join(REPO_ROOT, root), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) {
        found.push(`${root}/${entry.name}`);
      }
    }
  }

  return found.sort();
}

const directories = workspaceDirectories();

const workspaces: Workspace[] = directories
  .map((path) => ({ path, manifest: readManifest(path) }))
  .filter((w): w is Workspace => Boolean(w.manifest));

const rootManifest = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
) as Manifest;

const lockfile = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'),
) as { packages: Record<string, { name?: string }> };

/** Every name a workspace in this tree actually publishes under. */
const provided = new Set(
  workspaces
    .map((w) => w.manifest.name)
    .filter((name): name is string => Boolean(name)),
);

type Declaration = { manifest: string; name: string };

function scopedDeclarations(): Declaration[] {
  const found: Declaration[] = [];

  for (const { path, manifest } of [
    { path: '.', manifest: rootManifest },
    ...workspaces,
  ]) {
    for (const section of DEPENDENCY_SECTIONS) {
      for (const name of Object.keys(manifest[section] ?? {})) {
        if (name.startsWith(SCOPE)) {
          found.push({ manifest: `${path}/package.json`, name });
        }
      }
    }
  }

  return found;
}

const declarations = scopedDeclarations();

describe('a declared workspace exists', () => {
  it('finds the workspaces and the declarations it is meant to police', () => {
    // Guard on the guard. A rename of `packages/` or a lockfile that stops
    // parsing would otherwise leave every assertion below passing over an
    // empty list, which is the failure this whole file is about.
    expect(workspaces.length).toBeGreaterThan(15);
    expect(declarations.length).toBeGreaterThan(20);
    expect(rootManifest.workspaces).toEqual(
      WORKSPACE_ROOTS.map((root) => `${root}/*`),
    );
  });

  it('has a manifest for every workspace directory', () => {
    const withoutManifest = directories.filter(
      (path) => !existsSync(join(REPO_ROOT, path, 'package.json')),
    );

    expect(
      withoutManifest,
      'Each of these sits under a workspace glob and has no package.json. ' +
        'npm still links it when the lockfile says to, so what you get is an ' +
        'installed package that cannot be imported, and the other guards ' +
        'here skip the directory in silence. Usually it is build output that ' +
        'outlived its own source: delete the directory, and the dependency ' +
        'lines and lockfile entries that name it.',
    ).toEqual([]);
  });

  it('resolves every @ragenai/* dependency to a workspace in the tree', () => {
    const dangling = declarations
      .filter(({ name }) => !provided.has(name))
      .map(({ manifest, name }) => `${manifest} declares ${name}`);

    expect(
      Array.from(new Set(dangling)).sort(),
      "Each of these declares a package in this repository's own scope that " +
        'no workspace provides. The install will not complain — it links the ' +
        'name to whatever directory is there and moves on — so the first ' +
        'report comes from whichever process imports it, as a runtime ' +
        'resolve error.',
    ).toEqual([]);
  });

  it('names no workspace in the lockfile that is not in the tree', () => {
    const missing = Object.keys(lockfile.packages)
      .filter((path) =>
        WORKSPACE_ROOTS.some((root) => path.startsWith(`${root}/`)),
      )
      .filter((path) => !existsSync(join(REPO_ROOT, path, 'package.json')));

    expect(
      missing.sort(),
      'package-lock.json names these as workspaces and they have no ' +
        'manifest. Run `npm install` with the pinned npm — and check the ' +
        'result, because npm may keep the entry marked `extraneous` rather ' +
        'than removing it.',
    ).toEqual([]);
  });

  it('fails on a manifest that declares a workspace which is not there', () => {
    // The mutation the rule exists to catch, run through the same set the
    // assertion above uses, so it cannot pass vacuously.
    expect(provided.has('@ragenai/litellm-client')).toBe(false);
    expect(provided.has('@ragenai/platform-contracts')).toBe(true);
  });
});
