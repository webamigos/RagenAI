import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The Temporal SDK is not one package, it is ten that agree on a version.
 * `@temporalio/testing` depends on `@temporalio/worker` at an *exact* version,
 * as does `@temporalio/nyc-test-coverage`, and `@temporalio/worker` on
 * `@temporalio/common`. So a bump that moves one of them alone does not fail
 * to install — npm satisfies both constraints by installing two copies, one
 * hoisted and one nested under `apps/worker/node_modules`.
 *
 * Two copies means two distinct nominal types for the same interface, and the
 * error names both paths without explaining why they differ:
 *
 *   Argument of type
 *     'import("…/node_modules/@temporalio/worker/…").WorkerOptions'
 *   is not assignable to parameter of type
 *     'import("…/apps/worker/node_modules/@temporalio/worker/…").WorkerOptions'
 *
 * That is what #942 hit: dependabot's `dev-dependencies` group is keyed on
 * `dependency-type: development`, and Temporal straddles it — the runtime
 * packages are production dependencies of `apps/worker`, the two test packages
 * are dev dependencies. So the group moved half the family, to 1.23.0, and
 * left the other half pinned at 1.13.1.
 *
 * The config side of that is fixed in `.github/dependabot.yml`, which now
 * groups `@temporalio/*` ahead of the dependency-type groups. This guards the
 * invariant itself, because a hand edit reaches it too — and had already: the
 * root declared `@temporalio/client: ^1.13.0`, a caret that had floated ten
 * minors to 1.23.0 while `apps/worker` stayed pinned at 1.13.1. Nothing broke
 * only because no file imported across the boundary.
 *
 * Hence both halves of the rule: one version, and written exactly, since a
 * range is how the versions drift apart while the file still looks aligned.
 *
 * **The family shrank in E5, again in G3, and the rule did not.** E5 removed
 * the declarations nothing imported — the root and `apps/web` both declared
 * `@temporalio/client` and imported it nowhere. G3 moved
 * `packages/jobs-temporal` out of this repository altogether, to
 * `webamigos/ragen-enterprise`, taking the last `@temporalio/client`
 * declaration outside `apps/worker` with it.
 *
 * **One manifest holds the family now, and that is what this guard had to be
 * rewritten around rather than deleted.** It used to require that *both*
 * `apps/worker` and `packages/jobs-temporal` declare something, which a move
 * emptying either would have passed over silently — a guard that is satisfied
 * by an empty list says nothing. The rule that survives the move is the one
 * that mattered: whatever declares the family declares all of it, at one exact
 * version. G2 decided the bootstrap stays here, so `apps/worker` is the
 * manifest, and the two packages its Temporal runtime imports are named below.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** Every workspace that could declare a Temporal package, plus the root. */
const MANIFESTS = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/admin/package.json',
  'apps/worker/package.json',
  'apps/mcp/package.json',
  'packages/rag-core/package.json',
  'packages/db/package.json',
];

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

type Declaration = { manifest: string; name: string; spec: string };

function temporalDeclarations(manifests: string[]): Declaration[] {
  const found: Declaration[] = [];

  for (const manifest of manifests) {
    let raw: string;
    try {
      raw = readFileSync(join(REPO_ROOT, manifest), 'utf8');
    } catch {
      // A workspace may not exist yet, or may have been folded into another.
      continue;
    }

    const parsed = JSON.parse(raw) as Record<
      string,
      Record<string, string> | undefined
    >;

    for (const section of ['dependencies', 'devDependencies'] as const) {
      for (const [name, spec] of Object.entries(parsed[section] ?? {})) {
        if (name.startsWith('@temporalio/')) {
          found.push({ manifest, name, spec });
        }
      }
    }
  }

  return found;
}

describe('the Temporal family moves together', () => {
  const declarations = temporalDeclarations(MANIFESTS);

  it('finds the declarations it is meant to police', () => {
    // Guard on the guard. If a rename or a workspace move empties MANIFESTS,
    // every assertion below passes over an empty list and says nothing.
    expect(declarations.length).toBeGreaterThanOrEqual(4);

    // The one manifest that legitimately holds the family since G3: the
    // worker, which runs the Temporal bootstrap in process. The adapter's
    // manifest used to be named here too, and is in `ragen-enterprise` now —
    // its half of the version lock is that repository's dependabot group.
    expect(
      declarations.some((d) => d.manifest === 'apps/worker/package.json'),
      'apps/worker declares no @temporalio/* package. If the bootstrap has ' +
        'moved out too, this guard moves with it rather than passing over an ' +
        'empty list — and ADR-44 and ' +
        '`the-temporal-sdk-stays-on-the-temporal-path` both say it stays.',
    ).toBe(true);

    // Named rather than counted. A total is a weak proxy for "the worker can
    // still run Temporal": these two are what `src/temporal-runtime.ts` and
    // `src/workflows/` import, so losing either is a broken adapter path,
    // while a devDependency going away for an unrelated reason is not.
    for (const name of ['@temporalio/worker', '@temporalio/workflow']) {
      expect(
        declarations.some(
          (d) => d.manifest === 'apps/worker/package.json' && d.name === name,
        ),
        `apps/worker no longer declares ${name}, which its Temporal runtime imports.`,
      ).toBe(true);
    }
  });

  it('pins every @temporalio/* package to an exact version', () => {
    const ranged = declarations.filter((d) => !EXACT_VERSION.test(d.spec));

    expect(
      ranged.map((d) => `${d.manifest}: ${d.name}@${d.spec}`),
      'A range lets one half of the family drift while the manifest still ' +
        'reads as aligned. Pin the exact version instead.',
    ).toEqual([]);
  });

  it('declares one and only one Temporal version across the monorepo', () => {
    const versions = [...new Set(declarations.map((d) => d.spec))];

    expect(
      versions,
      `Found ${versions.length} versions: ${declarations
        .map((d) => `${d.name}@${d.spec} (${d.manifest})`)
        .join(', ')}. ` +
        'Bump every @temporalio/* package in the same commit — a split ' +
        'installs two copies and typecheck fails on identical-looking types.',
    ).toHaveLength(1);
  });

  it('rejects a manifest whose Temporal version disagrees', () => {
    // The mutation the rule exists to catch, run against a real file that
    // declares a different version, so the assertion cannot pass vacuously.
    const mixed = temporalDeclarations([
      ...MANIFESTS,
      'tests/architecture/fixtures/temporal-version-drift.json',
    ]);

    expect([...new Set(mixed.map((d) => d.spec))].length).toBeGreaterThan(1);
  });
});
