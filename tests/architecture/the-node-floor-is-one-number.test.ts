import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Twenty-one statements of the same requirement, and none of them was true.
 *
 * `engines.node` said `>=24` in the root and in every workspace; the
 * installer's own check said the same; `.nvmrc` said `24`. Meanwhile
 * `jsdom@30.0.1` — a transitive dependency, arriving without a version bump
 * of ours — requires `^22.22.2 || ^24.15.0 || >=26.0.0`, and `.npmrc` sets
 * `engine-strict=true`, so npm *stops* on the mismatch. Every Node from 24.0
 * to 24.14 therefore failed `npm install` while passing every check in the
 * repository that claimed to be about the Node version — and so does every
 * Node 25, which that range skips and a bare `>=` cannot exclude.
 *
 * The failure was silent in CI because `actions/setup-node` with
 * `node-version: 24` installs the newest 24.x, which always satisfies the
 * real range. Only someone with an older 24 pinned — which `nvm install 24`
 * produced for weeks — could see it, and what they saw was a half-written
 * install directory.
 *
 * So the invariant is not "the range is `^24.15.0 || >=26.0.0`" (that will
 * move). It is **there is one range, and every file that states it states the
 * same one**. A workspace added with a copied `>=24` fails here, which is the
 * way the drift started.
 *
 * **What this cannot catch**, and the reason `installer.yml` pins real Nodes
 * either side of the boundary: it compares our declarations to each other, so
 * it would happily hold twenty-one manifests in perfect agreement on a range
 * that a dependency has since moved beyond. Only npm, on an actual Node,
 * answers that.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function readJson(path: string): {
  engines?: { node?: string };
} {
  return JSON.parse(readFileSync(path, 'utf8')) as {
    engines?: { node?: string };
  };
}

const ROOT_RANGE = readJson(join(REPO_ROOT, 'package.json')).engines?.node;

/**
 * Workspaces that declare a Node range of their own, each with the phrase its
 * README must carry to justify it.
 *
 * Only one kind of workspace qualifies: a **published client** that runs on
 * the caller's machine before any Ragen install exists, where refusing an old
 * Node would be a true statement about the installation and a false one about
 * the tool. `ragen-cli` prints help and forwards to `create-ragen-app`, whose
 * own runtime check refuses at the point where a too-old Node would actually
 * damage something.
 *
 * The README requirement is the point. An exemption that is only a line in
 * this array is indistinguishable from the copy-paste this test exists to
 * catch — it has to be a decision someone wrote down.
 */
const INDEPENDENT_RANGES: Record<string, string> = {
  'packages/ragen-cli': 'deliberately lower',
};

/** Every workspace manifest, the root excluded — it is the reference. */
const WORKSPACE_MANIFESTS = ['apps/*/package.json', 'packages/*/package.json']
  .flatMap((pattern) => globSync(pattern, { cwd: REPO_ROOT }))
  .sort();

const SHARED_MANIFESTS = WORKSPACE_MANIFESTS.filter(
  (manifest) => !(manifest.replace('/package.json', '') in INDEPENDENT_RANGES),
);

describe('the Node range is stated once', () => {
  it('names full versions in the root, not a bare major', () => {
    // A bare major is what let 24.13 through: it is a true statement about the
    // release line and a false one about the tree. `>=24.15.0` was the next
    // wrong answer — it accepts 25.x, which jsdom's range omits — so a range
    // with a caret or a gap is what this now insists on.
    expect(
      ROOT_RANGE,
      'The root engines.node must name major.minor.patch. A bare major cannot express a floor that a patch release moved, and a bare `>=` cannot exclude a release line a dependency skipped.',
    ).toMatch(/\d+\.\d+\.\d+/);
    expect(ROOT_RANGE).not.toMatch(/^>=\d+$/);
  });

  it('found the workspaces it is supposed to check', () => {
    // Without this, a broken glob turns the guard below into a green no-op.
    expect(SHARED_MANIFESTS.length).toBeGreaterThan(15);
  });

  it.each(SHARED_MANIFESTS)('%s declares the same range', (manifest) => {
    expect(
      readJson(join(REPO_ROOT, manifest)).engines?.node,
      `${manifest} disagrees with the root about which Nodes the install runs on. npm reads whichever it reaches first, so a wider range here is a promise the install cannot keep. If this workspace is a published client that deliberately runs on an older Node, add it to INDEPENDENT_RANGES and say why in its README.`,
    ).toBe(ROOT_RANGE);
  });

  it.each(Object.entries(INDEPENDENT_RANGES))(
    '%s explains its own range in its README',
    (workspace, phrase) => {
      const readme = join(REPO_ROOT, workspace, 'README.md');
      expect(
        readFileSync(readme, 'utf8'),
        `${workspace} declares a Node range of its own, so ${workspace}/README.md has to say why — a silent exemption is the drift this test exists to catch.`,
      ).toContain(phrase);
    },
  );

  it('is satisfied by the version .nvmrc selects', () => {
    // `.nvmrc` is the version a contributor actually ends up running, and nvm
    // has no notion of a range — so it carries the range's own floor exactly
    // rather than the major above it. `nvm use 24` resolves to whatever 24.x
    // is already installed, which is how an install landed on a Node the tree
    // rejects.
    const nvmrc = readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8').trim();

    expect(
      nvmrc,
      `.nvmrc reads "${nvmrc}", which is not the first version engines.node ("${ROOT_RANGE}") accepts.`,
    ).toBe(firstVersionOf(ROOT_RANGE));
  });

  it('is the range the installer refuses outside of', () => {
    // create-ragen-app runs before the tree exists, so it cannot read
    // engines.node from anywhere — it holds its own copy, and that copy is
    // the one a stranger meets first.
    const source = readFileSync(
      join(REPO_ROOT, 'packages', 'create-ragen-app', 'src', 'node-version.ts'),
      'utf8',
    );

    // Rendered from the same table the wizard checks against, so this compares
    // behaviour rather than a second spelling of it.
    const declared = [
      ...source.matchAll(
        /\{\s*from:\s*'([^']+)'(,\s*belowMajor:\s*(\d+))?\s*\}/g,
      ),
    ].map(([, from, , belowMajor]) => (belowMajor ? `^${from}` : `>=${from}`));

    expect(
      declared.length,
      'SUPPORTED_NODE_RANGES was not found as a literal in node-version.ts.',
    ).toBeGreaterThan(0);
    expect(declared.join(' || ')).toBe(ROOT_RANGE);
  });
});

/** `^24.15.0 || >=26.0.0` → `24.15.0`: the oldest Node the range accepts. */
function firstVersionOf(range: string | undefined): string | undefined {
  return range
    ?.split('||')[0]
    .trim()
    .replace(/^[\^>=~]+/, '');
}
