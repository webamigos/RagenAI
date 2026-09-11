import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Workspace packages must not build themselves from `prepare`.
 *
 * npm runs a workspace's `prepare` during `npm install` without ordering it
 * against the dependency graph, so `@ragenai/storage` would start `tsc` before
 * `@ragenai/env` had produced the `dist/` it imports, and the install died
 * with `error TS2307: Cannot find module '@ragenai/env'`. It is a race, so it
 * passed often enough to look like flakiness — it failed three of four clean
 * installs the day this was written, including a fresh `npx create-ragen-app`,
 * where it surfaces as a stranger's install breaking at its longest step with
 * an error that reads like a broken repository.
 *
 * `@ragenai/litellm-client` had already grown a workaround for its own case
 * (`tsc -p ../platform-contracts/tsconfig.json && npm run build`), which is
 * the shape this prevents: one hand-maintained build order per package, each
 * correct until the graph changes.
 *
 * The root `postinstall` builds them through turbo instead, whose `build` task
 * declares `dependsOn: ["^build"]`. That makes the order a property of the
 * task graph rather than of luck.
 *
 * `prepack` is still fine: it runs for `npm pack` and `npm publish` and not
 * for `npm install`, which is what `create-ragen-app` needs to ship a built
 * `dist/`.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
};

function readPackage(dir: string): PackageJson | undefined {
  try {
    return JSON.parse(
      readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf8'),
    ) as PackageJson;
  } catch {
    return undefined;
  }
}

const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => [entry.name, readPackage(entry.name)] as const)
  .filter((pair): pair is readonly [string, PackageJson] => Boolean(pair[1]));

describe('workspace packages build in dependency order', () => {
  it('finds the packages, so a bad read cannot pass vacuously', () => {
    expect(packages.length).toBeGreaterThan(5);
  });

  it.each(packages.map(([dir, pkg]) => [pkg.name ?? dir, pkg] as const))(
    '%s does not build itself from `prepare`',
    (name, pkg) => {
      expect(
        pkg.scripts?.prepare,
        `packages/${name} has a \`prepare\` script. npm runs it during \`npm install\` without ordering it against the dependency graph, which is what made clean installs fail at random. Build through the root \`postinstall\` (turbo, which has dependsOn: ["^build"]) instead — or use \`prepack\` if the package only needs building to be published.`,
      ).toBeUndefined();
    },
  );

  it('builds every package from the root postinstall, through turbo', () => {
    const root = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
    ) as PackageJson;

    // The ordering guarantee comes from turbo's task graph, so postinstall has
    // to go through it rather than looping over the packages itself.
    expect(root.scripts?.postinstall).toContain('packages:build');
    expect(root.scripts?.['packages:build']).toContain('turbo run build');
  });
});
