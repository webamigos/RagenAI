import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The repository runs Vitest, and only Vitest.
 *
 * ADR-48 moved `apps/worker` and `apps/api` off jest because AI SDK 7's
 * dependency tree is ESM-only and jest's CommonJS runtime cannot require it.
 * `apps/mcp` had no such forcing function, so it was left behind as
 * self-contained — and then stayed for months as the only workspace running a
 * second framework. `.github/workflows/ci.yml` picks up any workspace with a
 * `test` script, so jest, its config and its whole transform chain were
 * installed and executed on every pull request, for one workspace, with its
 * coverage counted nowhere.
 *
 * The cost of the holdout was not the runtime. It was two sets of mocking
 * idioms, two config surfaces to keep working across a TypeScript or Node
 * bump, and one directory where a contributor's `vi.mock` muscle memory
 * silently did nothing — the fourth row of ADR-48's table, the failure that
 * looks like a pass.
 *
 * A comment saying "please do not add jest back" is what would otherwise
 * carry this. This checks it instead, which is the difference between a
 * convention and an invariant.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** The globs in the root package.json's `workspaces` field, as directories. */
const WORKSPACE_PARENTS = ['apps', 'packages'];

/**
 * Packages whose name contains "jest" but which are not jest.
 *
 * `@testing-library/jest-dom` and `jest-axe` are matcher libraries with a
 * Vitest-compatible entry point, and `apps/web` uses both under Vitest. The
 * name is a historical artefact of where the matchers came from, not a
 * dependency on the runner. Listing them is deliberate: a bare
 * `name.includes('jest')` would fail on them, and the first person to hit
 * that would loosen the rule rather than the list.
 */
const NOT_THE_RUNNER = new Set([
  '@testing-library/jest-dom',
  'jest-axe',
  '@types/jest-axe',
]);

/**
 * Matched on the name without its scope, so a scope cannot hide the runner.
 *
 * The first version of this tested the whole name: `-jest$` caught `ts-jest`
 * and `babel-jest` and missed `@swc/jest` — the transformer a TypeScript
 * project is most likely to reach for — along with every scoped plugin shaped
 * like `@<scope>/jest-<thing>`. Dropping the scope first turns those into one
 * rule; `@jest/*` is checked before it, because that scope *is* the runner and
 * dropping it leaves names like `globals` that match nothing.
 */
function isJestPackage(name: string): boolean {
  if (NOT_THE_RUNNER.has(name)) {
    return false;
  }
  // @jest/globals, @jest/types — the runner publishes under its own scope.
  if (name.startsWith('@jest/')) {
    return true;
  }
  const unscoped = name.startsWith('@')
    ? name.slice(name.indexOf('/') + 1)
    : name;
  return (
    unscoped === 'jest' ||
    // jest-environment-jsdom, @quramy/jest-prisma, …
    unscoped.startsWith('jest-') ||
    // ts-jest, babel-jest, @swc/jest is the `=== 'jest'` case above.
    unscoped.endsWith('-jest')
  );
}

type Manifest = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Every manifest npm installs from: the root plus each workspace. */
function manifestPaths(): string[] {
  const found = ['package.json'];

  for (const parent of WORKSPACE_PARENTS) {
    const parentPath = join(REPO_ROOT, parent);
    if (!existsSync(parentPath)) {
      continue;
    }
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifest = `${parent}/${entry.name}/package.json`;
      if (existsSync(join(REPO_ROOT, manifest))) {
        found.push(manifest);
      }
    }
  }

  return found;
}

function readManifest(relativePath: string): Manifest {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, relativePath), 'utf8'),
  ) as Manifest;
}

const MANIFESTS = manifestPaths();

describe('one test runner for every workspace', () => {
  it('found the workspaces to check', () => {
    // Guard on the guard. A rename of `apps/` or `packages/` would leave the
    // assertions below iterating over the root manifest alone and reporting
    // success, which is how a check like this dies quietly.
    expect(MANIFESTS.length).toBeGreaterThan(10);
    expect(MANIFESTS).toContain('apps/mcp/package.json');
  });

  it.each(MANIFESTS)('%s depends on no part of jest', (path) => {
    const manifest = readManifest(path);
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];

    const jestPackages = declared.filter(isJestPackage);

    expect(
      jestPackages,
      `${path} declares ${jestPackages.join(', ')}. The repository runs ` +
        'Vitest (ADR-48): a second runner means a second set of mocking ' +
        'idioms and a workspace where `vi.mock` does nothing. If this is a ' +
        'matcher library rather than the runner, add it to NOT_THE_RUNNER ' +
        'in this file with a note saying why.',
    ).toEqual([]);
  });

  it.each(MANIFESTS)('%s runs its tests through vitest', (path) => {
    const { scripts = {} } = readManifest(path);
    const testScripts = Object.entries(scripts).filter(([name]) =>
      /^test(:|$)/.test(name),
    );

    const onJest = testScripts
      .filter(([, command]) => /\bjest\b/.test(command))
      .map(([name]) => name);

    expect(
      onJest,
      `${path} runs ${onJest.join(', ')} through jest. CI's ` +
        '`turbo run test` picks up any workspace with a `test` script, so ' +
        'this one would install and execute a second framework on every ' +
        'pull request — and `turbo run test:coverage` would not see it.',
    ).toEqual([]);
  });

  it('has no jest configuration left anywhere', () => {
    const configs: string[] = [];

    for (const path of MANIFESTS) {
      const dir = path.replace(/package\.json$/, '');
      for (const entry of readdirSync(join(REPO_ROOT, dir))) {
        if (/^jest\.(config|setup)\./.test(entry) || entry === '.jestrc') {
          configs.push(`${dir}${entry}`);
        }
      }
    }

    expect(
      configs,
      `Configuration for a runner nothing invokes: ${configs.join(', ')}. ` +
        'A config left behind is how the next person concludes jest is ' +
        'still supported here.',
    ).toEqual([]);
  });
});
