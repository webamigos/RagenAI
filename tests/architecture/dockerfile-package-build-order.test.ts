import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A Dockerfile that builds workspace packages one at a time must list them in
 * dependency order.
 *
 * `apps/worker` and `apps/mcp` do not run these through turbo — they chain
 * `npm run build --workspace=…` calls, so nothing derives the order from the
 * dependency graph and the list is maintained by hand. That held until
 * ADR-37's `@ragenai/env` gained a consumer: `@ragenai/storage` started
 * importing it, the worker's list still built storage first, and the image
 * failed with `Cannot find module '@ragenai/env' or its corresponding type
 * declarations` — a message that names the package that is *fine* rather than
 * the one in the wrong place.
 *
 * It only breaks in Docker. A local build works because every package already
 * has a built `dist` directory, and `.dockerignore` excludes those precisely
 * so the image cannot inherit one. So the ordering is invisible to
 * `npm run verify` and shows up as a red deploy.
 *
 * This derives the requirement from the manifests rather than restating it:
 * for every pair in a chain, if the earlier package depends on the later one,
 * the list is wrong.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** `npm run build --workspace=<name>`, in the order the Dockerfile runs them. */
function buildChain(dockerfile: string): string[] {
  return [...dockerfile.matchAll(/npm run build --workspace=(@[\w./-]+)/g)].map(
    (match) => match[1] as string,
  );
}

function dependenciesOf(packageName: string): Set<string> {
  const dir = packageName.replace(/^@ragenai\//, '');
  const manifestPath = join(REPO_ROOT, 'packages', dir, 'package.json');
  if (!existsSync(manifestPath)) {
    return new Set();
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
}

function dockerfilesWithAChain(): { app: string; chain: string[] }[] {
  const appsDir = join(REPO_ROOT, 'apps');

  return readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      app: entry.name,
      path: join(appsDir, entry.name, 'Dockerfile'),
    }))
    .filter(({ path }) => existsSync(path))
    .map(({ app, path }) => ({
      app,
      chain: buildChain(readFileSync(path, 'utf8')).filter((name) =>
        name.startsWith('@ragenai/'),
      ),
    }))
    .filter(({ chain }) => chain.length > 1);
}

describe('a Dockerfile package build chain follows the dependency graph', () => {
  const chains = dockerfilesWithAChain();

  it('finds a chain to check, so a broken parse cannot pass vacuously', () => {
    expect(chains.length).toBeGreaterThan(0);
    // The regression this exists for was in apps/worker.
    expect(chains.map(({ app }) => app)).toContain('worker');
  });

  it.each(chains)(
    'apps/$app builds each package after its dependencies',
    ({ app, chain }) => {
      for (let earlier = 0; earlier < chain.length; earlier += 1) {
        const dependencies = dependenciesOf(chain[earlier] as string);

        for (let later = earlier + 1; later < chain.length; later += 1) {
          const laterPackage = chain[later] as string;

          expect(
            dependencies.has(laterPackage),
            `apps/${app}/Dockerfile builds ${chain[earlier]} before ${laterPackage}, but ${chain[earlier]} depends on it. tsc will not find its type declarations. Move ${laterPackage} earlier in the chain.`,
          ).toBe(false);
        }
      }
    },
  );
});
