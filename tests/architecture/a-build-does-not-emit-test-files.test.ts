import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * An app's `dist/` is what its image ships, and a test file has no business
 * being in it.
 *
 * `apps/worker` shipped 252 of them — 762 KB of compiled specs, fixtures and
 * their declaration and source maps — in every published image, because its
 * build ran straight from `tsconfig.json`, whose `include` is `src/**` and
 * whose `exclude` was `node_modules` alone. `apps/mcp` and `apps/api` had it
 * right all along, each with a `tsconfig.build.json` that excludes tests, which
 * is why this was one app's oversight rather than a convention nobody had.
 *
 * **Dead weight is the small half.** Three of those files import
 * `@temporalio/testing` and `@temporalio/nyc-test-coverage`, devDependencies
 * that `npm ci --omit=dev` deliberately leaves out — so the image carried
 * modules that could not load in it, and `grep '@temporalio/'` over the
 * compiled output named six packages where the runtime needs three. That
 * mattered concretely: `ragen-enterprise`'s `verify-layer.mjs` derives from
 * exactly that grep which SDK packages its layer has to install, and had to
 * special-case `__tests__` to avoid demanding a test framework in production.
 * A build output that lies about its own dependencies is the kind of thing
 * other tooling then has to work around.
 *
 * **Asserted by compiling, not by reading the config.** A string match on
 * `exclude` would pass for a pattern that matches nothing — the failure mode
 * `docs/lessons/path-filters-fail-open-after-a-directory-move.md` is about — so
 * this asks TypeScript itself which files the build would emit, through the
 * same `extends` chain and the same globs tsc uses.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');
const APPS = join(REPO_ROOT, 'apps');

/**
 * Where each app's build gets its TypeScript configuration.
 *
 * Derived from the `build` script rather than assumed, so an app that changes
 * how it builds is either picked up or skipped explicitly. Next apps are the
 * skip: `next build` traces from entry points into `.next`, so an unimported
 * spec is not emitted at all — confirmed against the published `ragen-web` and
 * `ragen-admin` images, which contain no compiled test file.
 */
function buildConfigFor(app: string): string | null {
  const manifest = join(APPS, app, 'package.json');
  if (!existsSync(manifest)) {
    return null;
  }

  const build = (
    JSON.parse(readFileSync(manifest, 'utf8')) as {
      scripts?: Record<string, string>;
    }
  ).scripts?.build;

  if (!build) {
    return null;
  }
  if (build.includes('next build')) {
    return null;
  }

  // `nest build` compiles with `tsconfig.build.json` beside `nest-cli.json`.
  // The CLI's own `--config` is not used here, and if it ever is this mapping
  // has to follow it rather than keep guessing.
  if (build.includes('nest build')) {
    return join(APPS, app, 'tsconfig.build.json');
  }

  // `tsc -p <config>` and `tsc --build <config>`.
  const named = /(?:-p|--project|--build|-b)\s+(\S+\.json)/.exec(build);
  if (named) {
    return join(APPS, app, named[1]);
  }

  // A bare `tsc --build` / `tsc`, which uses tsconfig.json — the shape that
  // shipped the tests.
  if (/\btsc\b/.test(build)) {
    return join(APPS, app, 'tsconfig.json');
  }

  return null;
}

/** The files tsc would compile, resolved the way tsc resolves them. */
function compiledFiles(configPath: string): string[] {
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(
    read.error,
    `could not read ${relative(REPO_ROOT, configPath)}`,
  ).toBeUndefined();

  const parsed = ts.parseJsonConfigFileContent(
    read.config as object,
    ts.sys,
    dirname(configPath),
  );

  const fatal = parsed.errors.filter(
    (error) => error.category === ts.DiagnosticCategory.Error,
  );
  expect(
    fatal.map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, ' '),
    ),
    `${relative(REPO_ROOT, configPath)} did not parse`,
  ).toEqual([]);

  return parsed.fileNames;
}

/**
 * What counts as a test file.
 *
 * Both halves matter and the second is the one that catches a fixture: `.spec`
 * and `.test` name the suites, and a `__tests__` directory holds whatever they
 * need — `apps/worker/src/__tests__/fixtures/mock-activities.ts` is not a suite
 * and belongs in the build no more than one is.
 */
const IS_TEST = /(^|\/)__tests__\/|\.(spec|test)\.tsx?$/;

const apps = ['web', 'api', 'admin', 'worker', 'mcp'];
const compiled = apps
  .map((app) => ({ app, config: buildConfigFor(app) }))
  .filter(
    (entry): entry is { app: string; config: string } => entry.config !== null,
  );

describe('a build does not emit test files', () => {
  it('finds the builds it is meant to police', () => {
    // Zero here, or a missing config, would make every case below vacuous —
    // and an app that silently stopped being checked is the shape this whole
    // directory is written against.
    expect(
      compiled.map((entry) => entry.app).sort(),
      'the tsc-built apps changed. If one moved to a bundler it belongs in the ' +
        'skip in buildConfigFor(), with the evidence that its output is clean; ' +
        'if a new one appeared it belongs here.',
    ).toEqual(['api', 'mcp', 'worker']);

    for (const { app, config } of compiled) {
      expect(existsSync(config), `apps/${app}: no ${config}`).toBe(true);
    }
  });

  it.each(compiled)('apps/$app', ({ app, config }) => {
    const files = compiledFiles(config).map((file) =>
      relative(REPO_ROOT, file),
    );

    // The config resolving to nothing would pass the assertion below while
    // saying nothing at all about the build.
    expect(
      files.length,
      `${relative(REPO_ROOT, config)} compiles no files`,
    ).toBeGreaterThan(10);

    const tests = files.filter((file) => IS_TEST.test(file));

    expect(
      tests,
      `apps/${app}'s build compiles these test files into dist/, and its image ` +
        'ships whatever is there. Exclude them in ' +
        `${relative(REPO_ROOT, config)} — and keep them in the config that ` +
        'type-checks, which is a different file: a suite nothing compiles is ' +
        'the type drift CI’s typecheck job exists to catch.',
    ).toEqual([]);
  });

  /**
   * The mutation, run against a real config rather than argued about.
   *
   * `tsconfig.json` is the one each build config narrows, and it deliberately
   * *does* include the tests — that is what type-checks them. So compiling it
   * must find some, which is what establishes that the assertion above is
   * capable of failing and that `IS_TEST` matches this repository's layout.
   */
  it('would notice, because the type-checking config still sees the tests', () => {
    const files = compiledFiles(join(APPS, 'worker', 'tsconfig.json')).map(
      (file) => relative(REPO_ROOT, file),
    );

    expect(
      files.filter((file) => IS_TEST.test(file)).length,
      'apps/worker/tsconfig.json no longer includes its tests. Something has ' +
        'to type-check them; if that moved to another config, point this case ' +
        'at it rather than deleting it.',
    ).toBeGreaterThan(10);
  });
});
