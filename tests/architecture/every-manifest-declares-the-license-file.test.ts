import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './tracked-files';

/**
 * Every `package.json` declares the licence that `LICENSE` grants.
 *
 * `license` in a manifest is the machine-readable answer — what `npm view`
 * prints, what SBOM and licence scanners read, what a company's legal review
 * looks at before it allows a self-hosted install. This repository shipped
 * `LICENSE` as Apache-2.0 while the root said `MIT`, `apps/api` said
 * `UNLICENSED` (npm's spelling of "no right to use this is granted") and
 * `apps/worker` said `ISC` — `npm init` defaults nobody revisited — and most
 * other workspaces said nothing at all (#1136).
 *
 * The expected identifier is read from `LICENSE`, not written here, so a
 * deliberate relicensing is one edit to one file and this guard follows it.
 * A workspace that is meant to be licensed differently has to say so in the
 * test, by name, not by drifting.
 */

const WORKSPACE_PARENTS = ['apps', 'packages'] as const;

/** Workspaces deliberately under another licence. None today. */
const OTHER_LICENSE: Readonly<Record<string, string>> = {};

/** The SPDX identifier `LICENSE` is the text of. Only the ones we might use. */
function licenseFileIdentifier(): string {
  const text = readFileSync(join(REPO_ROOT, 'LICENSE'), 'utf8');

  if (/Apache License\s+Version 2\.0/.test(text)) {
    return 'Apache-2.0';
  }
  if (/^MIT License/m.test(text)) {
    return 'MIT';
  }

  throw new Error(
    'LICENSE is not a text this guard recognises. Teach ' +
      'licenseFileIdentifier() the new one rather than skipping the check.',
  );
}

function manifests(): string[] {
  const found = ['package.json'];

  for (const parent of WORKSPACE_PARENTS) {
    const parentPath = join(REPO_ROOT, parent);
    if (!existsSync(parentPath)) {
      continue;
    }

    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      const manifest = join(parent, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(join(REPO_ROOT, manifest))) {
        found.push(manifest);
      }
    }
  }

  return found;
}

describe('every workspace manifest declares the licence LICENSE grants', () => {
  const expected = licenseFileIdentifier();

  it('finds the root and the workspaces', () => {
    const all = manifests();

    expect(all).toContain('package.json');
    expect(all.length).toBeGreaterThan(10);
  });

  it.each(manifests())('%s', (manifest) => {
    const parsed = JSON.parse(
      readFileSync(join(REPO_ROOT, manifest), 'utf8'),
    ) as { license?: string };
    const workspace = manifest.replace(/\/package\.json$/, '');

    expect(parsed.license, `${manifest} has no "license" field`).toBeDefined();
    expect(parsed.license).toBe(OTHER_LICENSE[workspace] ?? expected);
  });
});
