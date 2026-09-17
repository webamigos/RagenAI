import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Twenty-one statements of the same requirement, and none of them was true.
 *
 * `engines.node` said `>=24` in the root and in every workspace; the
 * installer's own check said the same; `.nvmrc` said `24`. Meanwhile
 * `jsdom@30.0.1` — a transitive dependency, arriving without a version bump
 * of ours — requires `^24.15.0`, and `.npmrc` sets `engine-strict=true`, so
 * npm *stops* on the mismatch. Every Node from 24.0 to 24.14 therefore failed
 * `npm install` while passing every check in the repository that claimed to
 * be about the Node version.
 *
 * The failure was silent in CI because `actions/setup-node` with
 * `node-version: 24` installs the newest 24.x, which always satisfies the
 * real floor. Only someone with an older 24 pinned — which `nvm install 24`
 * produced for weeks — could see it, and what they saw was a half-written
 * install directory.
 *
 * So the invariant is not "the floor is 24.15.0" (that number will move). It
 * is **there is one floor, and every file that states it states the same
 * one**. A workspace added with a copied `>=24` fails here, which is the way
 * the drift started.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function readJson(path: string): { engines?: { node?: string } } {
  return JSON.parse(readFileSync(path, 'utf8')) as {
    engines?: { node?: string };
  };
}

const ROOT_FLOOR = readJson(join(REPO_ROOT, 'package.json')).engines?.node;

/** Every workspace manifest, the root excluded — it is the reference. */
const WORKSPACE_MANIFESTS = ['apps/*/package.json', 'packages/*/package.json']
  .flatMap((pattern) => globSync(pattern, { cwd: REPO_ROOT }))
  .sort();

describe('the Node floor is one number', () => {
  it('is a full version in the root, not a bare major', () => {
    // A bare major is what let 24.13 through: it is a true statement about
    // the release line and a false one about the tree.
    expect(
      ROOT_FLOOR,
      'The root engines.node must name major.minor.patch — a bare major cannot express a floor that a patch release moved.',
    ).toMatch(/^>=\d+\.\d+\.\d+$/);
  });

  it('found the workspaces it is supposed to check', () => {
    // Without this, a broken glob turns the guard below into a green no-op.
    expect(WORKSPACE_MANIFESTS.length).toBeGreaterThan(15);
  });

  it.each(WORKSPACE_MANIFESTS)('%s declares the same floor', (manifest) => {
    expect(
      readJson(join(REPO_ROOT, manifest)).engines?.node,
      `${manifest} disagrees with the root about the minimum Node. npm reads whichever it reaches first, so a lower floor here is a promise the install cannot keep.`,
    ).toBe(ROOT_FLOOR);
  });

  it('is satisfied by the version .nvmrc selects', () => {
    // `.nvmrc` is the version a contributor actually ends up running, and nvm
    // has no notion of a range — so it carries the floor exactly rather than
    // the major above it.
    const nvmrc = readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8').trim();

    expect(
      nvmrc,
      `.nvmrc reads "${nvmrc}" but engines.node is "${ROOT_FLOOR}". nvm resolves a bare major to whatever 24.x is already installed, which is exactly how an install landed on a Node the tree rejects.`,
    ).toBe(ROOT_FLOOR?.replace(/^>=/, ''));
  });

  it('is the floor the installer refuses below', () => {
    // create-ragen-app runs before the tree exists, so it cannot read
    // engines.node from anywhere — it holds its own copy, and that copy is
    // the one a stranger meets first.
    const source = readFileSync(
      join(REPO_ROOT, 'packages', 'create-ragen-app', 'src', 'node-version.ts'),
      'utf8',
    );
    const declared = /REQUIRED_NODE_VERSION\s*=\s*'([^']+)'/.exec(source)?.[1];

    expect(
      declared,
      'REQUIRED_NODE_VERSION is not declared as a string literal in node-version.ts.',
    ).toBeDefined();
    expect(declared).toBe(ROOT_FLOOR?.replace(/^>=/, ''));
  });
});
