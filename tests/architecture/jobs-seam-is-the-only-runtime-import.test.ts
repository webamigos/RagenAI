import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JOB_NAMES } from '@ragenai/jobs';

/**
 * The boundary that makes the job runtime swappable.
 *
 * Two directions, and both have cost this repository something before:
 *
 * - **No package reaches into an app.** A type-only import is still an import:
 *   it inverts the dependency the workspace graph declares and makes a package
 *   unbuildable without an app's declarations. This is why the eight handlers
 *   stayed in `apps/worker` beside the activities they call rather than moving
 *   into `packages/jobs` — see the worker-runtime spec's §2.
 * - **One package imports the engine.** `@temporalio/*` belongs to
 *   `packages/jobs-temporal` alone, which is what turns the spec's Phase G
 *   extraction into a `git mv`. `apps/api` stopped importing it directly in
 *   Phase A4; `apps/web` still does, from two files the seam cannot answer
 *   yet — the cancel command sends a signal and the docgen status route
 *   describes a workflow. Phase B removes both, and this test does not bless
 *   the gap in the meantime.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const PACKAGES = join(ROOT, 'packages');
const APPS = join(ROOT, 'apps');

/**
 * Build output is not source, and walking it makes this guard answer
 * differently depending on whether someone has run a build. `.next` in
 * particular contains the traced server bundle, which inlines whatever the app
 * imported transitively — so scanning it reports `bullmq` as an app import
 * because the *adapter* uses it, which is the opposite of what this asserts.
 * It also took the scan from one second to five.
 */
const NOT_SOURCE = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  'generated',
]);

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (NOT_SOURCE.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
};

/**
 * Packages *and* apps, for a rule that has no legitimate exception.
 *
 * `packagesExcept` alone is what the `@temporalio/*` assertion can use, because
 * apps/worker genuinely imports `@temporalio/worker`: it is the process that
 * runs the workflows, and Phase G has to deal with that separately. BullMQ has
 * no such history — it arrived with the seam already in place — so the boundary
 * is drawn where it should have been from the start, and an app reaching for
 * `bullmq` is caught rather than discovered during the extraction.
 */
const everywhereExcept = (excludedPackages: string[]): string[] => [
  ...packagesExcept(excludedPackages),
  ...readdirSync(APPS)
    .filter((name) => statSync(join(APPS, name)).isDirectory())
    .flatMap((name) => sourceFiles(join(APPS, name))),
];

const packagesExcept = (excluded: string[]): string[] =>
  readdirSync(PACKAGES)
    .filter((name) => !excluded.includes(name))
    .filter((name) => statSync(join(PACKAGES, name)).isDirectory())
    .flatMap((name) => sourceFiles(join(PACKAGES, name)));

/**
 * Every form a module specifier can take, because a rule that only sees
 * `from '…'` is a rule you can walk around by writing `require()` or
 * `await import()` — and the one thing this guard exists to stop is exactly
 * the sort of edit someone makes when a static import is inconvenient.
 *
 * Text rather than the TypeScript AST, which is this repository's own idiom
 * for architecture tests: they read source as text so one test can speak for
 * the whole monorepo without a compiler pass per file.
 */
const SPECIFIER = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

const importsIn = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((match) => match[1]);

describe('the jobs seam is the only place that names a runtime', () => {
  it('no package imports from an app', () => {
    // `packages/db` is the one exception, and it is older than this rule: it
    // constructs `PrismaClient` from `apps/web/src/generated/prisma`, because
    // the generated client is a per-app artifact that no package can own. It
    // gets away with it by shipping raw TypeScript rather than a build, which
    // is exactly the property `packages/jobs` cannot have — apps/api compiles
    // to CommonJS and runs the output. Listing it here rather than widening
    // the rule keeps the next one from being waved through.
    const offenders = packagesExcept(['db']).filter((file) =>
      importsIn(file).some(
        (specifier) =>
          specifier.startsWith('@/') ||
          specifier.includes('apps/web') ||
          specifier.includes('apps/api') ||
          specifier.includes('apps/worker'),
      ),
    );

    expect(
      offenders.map((f) => f.replace(`${ROOT}/`, '')),
      'a package importing from an app inverts the workspace graph — move the shared thing into the package instead',
    ).toEqual([]);
  });

  it('only packages/jobs-temporal imports @temporalio/*', () => {
    const offenders = packagesExcept(['jobs-temporal']).filter((file) =>
      importsIn(file).some((specifier) => specifier.startsWith('@temporalio/')),
    );

    expect(
      offenders.map((f) => f.replace(`${ROOT}/`, '')),
      'the engine belongs to its adapter package — that is what makes the extraction a move rather than a rewrite',
    ).toEqual([]);
  });

  /**
   * The same rule as Temporal's, and it earns its place for the same reason:
   * the moment `bullmq` is imported from a handler or an app, the adapter stops
   * being replaceable and Phase G stops being a move. It is cheaper to hold now,
   * with one importer, than to re-establish later.
   *
   * Apps are in scope here and not in the Temporal assertion above, which is
   * the difference worth stating: apps/worker imports `@temporalio/worker`
   * because it runs the workflows, and that is a debt Phase G inherits. The
   * consumer half of BullMQ therefore goes *through this package* rather than
   * being built in the worker — the rule decides the design rather than
   * recording it afterwards.
   */
  it('only packages/jobs-bullmq imports bullmq', () => {
    const offenders = everywhereExcept(['jobs-bullmq']).filter((file) =>
      importsIn(file).some(
        (specifier) =>
          specifier === 'bullmq' || specifier.startsWith('bullmq/'),
      ),
    );

    expect(
      offenders.map((f) => f.replace(`${ROOT}/`, '')),
      'the engine belongs to its adapter package — that is what makes the extraction a move rather than a rewrite',
    ).toEqual([]);
  });

  it('every job name has a workflow that answers to it', () => {
    const workflows = sourceFiles(
      join(ROOT, 'apps', 'worker', 'src', 'workflows'),
    )
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    const missing = JOB_NAMES.filter(
      (name) => !new RegExp(`export async function ${name}\\b`).test(workflows),
    );

    expect(
      missing,
      'a name in the contract that no workflow implements is a job a producer can start and nothing will run',
    ).toEqual([]);
  });
});
