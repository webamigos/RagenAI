import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
 *
 * **`OMITTED_FROM_RUNTIME` is empty since G3, and the machinery stays.** It
 * recorded one entry — the worker's production install left out
 * `@ragenai/jobs-temporal` while that package was still a workspace here (the
 * spec's E6). G3 moved the package to `webamigos/ragen-enterprise`, so there
 * is no longer a declared-but-unshipped dependency to exempt: the worker
 * declares it nowhere and loads it, when an image has layered it in, through
 * `@ragenai/jobs`'s constant specifier. Keeping the map and its assertions
 * costs nothing and is what the next optional runtime lands in; emptying it
 * without saying so is how the exemption would come back unexamined.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const APPS = ['web', 'api', 'admin', 'worker', 'mcp'];

/**
 * Workspaces an app builds with but does not ship, by app.
 *
 * An entry here buys an exemption from the install-and-ship rule and pays for
 * it with the assertions below: the app must reach the package through
 * `await import(...)` and must not name it in a top-level `import`.
 */
const OMITTED_FROM_RUNTIME: Record<string, string[]> = {};

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

/** Every `.ts` file under an app's `src/`, as text. */
function sourceFiles(app: string): { path: string; source: string }[] {
  const root = join(REPO_ROOT, 'apps', app, 'src');
  const found: { path: string; source: string }[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push({ path: full, source: readFileSync(full, 'utf8') });
      }
    }
  };

  try {
    walk(root);
  } catch {
    return [];
  }

  return found;
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
    const omitted = OMITTED_FROM_RUNTIME[app] ?? [];
    const needed = workspaceDeps(app).filter((name) => !omitted.includes(name));

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

  const exemptions = Object.entries(OMITTED_FROM_RUNTIME).flatMap(
    ([app, names]) => names.map((name) => ({ app, name })),
  );

  it('every exemption is reached dynamically, since its image does not ship it', () => {
    // One case rather than `it.each`, because the list is empty since G3 and
    // `it.each([])` throws. Empty is the correct state — nothing is declared
    // and unshipped any more — so what this asserts is the rule an entry buys
    // its way past, for whenever the next optional runtime lands here.
    for (const { app, name } of exemptions) {
      // The whole exemption rests on this. A static import of `<name>` at the
      // top of any file the app loads resolves before a single line runs, so
      // the container would fail to start on the runtime it *does* ship — and
      // it would fail in the image only, which is the one place nothing here
      // can see.
      //
      // Three spellings resolve the package and one does not: a value import,
      // a bare `import '<name>'` for side effects, and a re-export are all
      // loads; `import type` / `export type` are erased by tsc. The same
      // matching as `the-temporal-sdk-stays-on-the-temporal-path.test.ts`,
      // which polices the SDK the same way one level down.
      const staticImport = new RegExp(
        `^\\s*(?:import|export)\\s+(?!type\\s)[^;]*?from\\s*['"]${name}['"]` +
          `|^\\s*import\\s*['"]${name}['"]`,
        'm',
      );
      const dynamicImport = new RegExp(`import\\(\\s*['"]${name}['"]`);

      const files = sourceFiles(app);
      expect(
        files.length,
        `apps/${app}/src has no sources to check`,
      ).toBeGreaterThan(0);

      const offenders = files
        .filter(({ source }) => staticImport.test(source))
        .map(({ path }) => relative(REPO_ROOT, path));

      expect(
        offenders,
        `${name} is omitted from apps/${app}'s production install, so these ` +
          'files must not import it at the top level — the container would ' +
          'fail at module resolution before reaching the branch that would ' +
          'never have used it.',
      ).toEqual([]);

      expect(
        files.some(({ source }) => dynamicImport.test(source)),
        `Nothing in apps/${app} imports ${name} dynamically. If the app no ` +
          'longer uses it at all, drop the dependency and this exemption ' +
          'rather than leaving a package that is declared, built and ' +
          'unreachable.',
      ).toBe(true);
    }
  });

  /**
   * The exemption that G3 retired, asserted from the other side.
   *
   * `apps/worker` no longer declares `@ragenai/jobs-temporal`, so the loop
   * above has nothing to check — but the property that made the omission safe
   * still has to hold, and now nothing else states it: the worker reaches the
   * adapter dynamically, through the seam's constant specifier, and never at
   * the top of a module. A static import would fail every start, including the
   * BullMQ one, and it would fail only in an image.
   */
  it('apps/worker reaches the out-of-repository adapter dynamically', () => {
    const files = sourceFiles('worker');
    expect(files.length).toBeGreaterThan(0);

    const staticImport =
      /^\s*(?:import|export)\s+(?!type\s)[^;]*?from\s*['"]@ragenai\/jobs-temporal['"]|^\s*import\s*['"]@ragenai\/jobs-temporal['"]/m;

    expect(
      files
        .filter(({ source }) => staticImport.test(source))
        .map(({ path }) => relative(REPO_ROOT, path)),
      '@ragenai/jobs-temporal is in webamigos/ragen-enterprise since G3. A ' +
        'static import of it does not resolve in this repository at all, and ' +
        'would fail every worker start in an image that had layered it in.',
    ).toEqual([]);

    expect(
      files.some(({ source }) =>
        /import\(\s*TEMPORAL_ADAPTER_PACKAGE\s*\)/.test(source),
      ),
      'Nothing in apps/worker loads the adapter through ' +
        "`import(TEMPORAL_ADAPTER_PACKAGE)`. That constant is the seam's, and " +
        'passing it rather than a literal is what keeps `tsc --build` working ' +
        'on a default install — TypeScript resolves a literal specifier ' +
        'whichever branch guards it.',
    ).toBe(true);
  });
});
