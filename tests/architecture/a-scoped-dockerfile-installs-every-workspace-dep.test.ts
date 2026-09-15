import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * An app whose Dockerfile installs with `npm ci --workspace=…` gets exactly the
 * workspaces it names. Every `@ragenai/*` package the app depends on has to be
 * named in four places, and missing any one fails the image build only.
 *
 * This has now happened twice on `apps/worker`, a day apart:
 *
 * - the jest-to-vitest migration left `vitest/globals` in its tsconfig with no
 *   `vitest` dependency — `TS2688: Cannot find type definition file`;
 * - B2b added `@ragenai/llm-gateway` as a dependency and updated none of the
 *   Dockerfile's lists — `TS2307: Cannot find module '@ragenai/llm-gateway'`.
 *
 * The first was guarded by `tsconfig-types-are-installable`, which checked the
 * tsconfig's `types` and nothing else — so the second sailed through a guard
 * written the day before for the same failure. This one checks the dependency
 * list, which is the general case.
 *
 * Nothing before the image build can see it: a root install hoists every
 * workspace into one `node_modules`, so local builds and CI resolve packages
 * the scoped install never installs.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const APPS = ['web', 'api', 'admin', 'worker', 'mcp'];

function read(path: string): string | null {
  try {
    return readFileSync(join(REPO_ROOT, path), 'utf8');
  } catch {
    return null;
  }
}

/** Workspace packages the app depends on, runtime or dev. */
function workspaceDeps(app: string): string[] {
  const manifest = read(`apps/${app}/package.json`);
  if (!manifest) {
    return [];
  }
  const pkg = JSON.parse(manifest) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return (
    [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]
      .filter((name) => name.startsWith('@ragenai/'))
      // Lint config is never imported by shipped code, so a build cannot need it.
      .filter((name) => name !== '@ragenai/eslint-config')
  );
}

const scoped = APPS.filter((app) => {
  const dockerfile = read(`apps/${app}/Dockerfile`);
  return dockerfile !== null && /npm ci\s+--workspace=/.test(dockerfile);
});

describe('a Dockerfile that installs scoped names every workspace it needs', () => {
  it('finds at least one scoped Dockerfile', () => {
    // Zero here would make every assertion below vacuous, which is how a guard
    // like this stops working without anyone noticing.
    expect(scoped.length).toBeGreaterThan(0);
  });

  it.each(scoped)('apps/%s', (app) => {
    const dockerfile = read(`apps/${app}/Dockerfile`) ?? '';
    const needed = workspaceDeps(app);

    const missing = needed.filter((name) => {
      const short = name.replace('@ragenai/', '');
      return !(
        dockerfile.includes(`--workspace=${name}`) &&
        dockerfile.includes(`COPY packages/${short}/package.json`) &&
        dockerfile.includes(`npm run build --workspace=${name}`)
      );
    });

    expect(
      missing,
      `apps/${app} depends on ${missing.join(', ')}, and apps/${app}/Dockerfile ` +
        'does not install, copy the manifest for, and build each of them.\n' +
        'All three are needed: the scoped `npm ci` installs only what it is ' +
        'told, the symlink into packages/ needs that manifest present, and an ' +
        'unbuilt package has no dist for tsc to resolve.\n' +
        'A root install hides every one of these — only the image build fails, ' +
        'with TS2307 naming the module.',
    ).toEqual([]);
  });
});
