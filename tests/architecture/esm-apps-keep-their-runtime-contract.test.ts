import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `apps/api` and `apps/worker` are both `"type": "module"`. Three things that
 * used to be free stopped being free the moment they were, and every one of
 * them fails *quietly*.
 *
 * 1. **`require` is not defined in ESM.** It still typechecks — `@types/node`
 *    declares it globally — so tsc, eslint and the whole test suite stay green
 *    while the call throws at runtime. `apps/api`'s `instrument.ts` had
 *    fourteen of them inside a `try`/`catch` that logged the ReferenceError
 *    and carried on, so the app booted with every exporter and every
 *    auto-instrumentation missing and one line in the startup log to say so.
 *
 * 2. **OpenTelemetry's patching needs a loader hook under ESM.**
 *    `registerInstrumentations` hooks CommonJS `require` calls, which the ESM
 *    loader never makes. Without
 *    `--import @opentelemetry/instrumentation/hook.mjs` the SDK initialises,
 *    reports that it did, exports spans it creates itself — and traces no
 *    HTTP, no Postgres and no Prisma. There is no error, only an empty trace
 *    view, which is indistinguishable from a quiet service.
 *
 * 3. **Deferring the instrumentation loses the ordering `require` had.**
 *    Neither a top-level await (`apps/api`) nor a dynamic import inside an
 *    async function (`apps/worker`) makes the entry's *sibling* imports wait:
 *    Nest, Prisma and `pg` finish loading while instrumentation is still
 *    suspended, so the patching lands after the modules it means to patch.
 *    The file has to be preloaded with `--import <dist>/instrument.js`, which
 *    runs it to completion — top-level await included — before the entry's
 *    graph is touched.
 *
 * Both flags therefore have to be on every way each app is actually started.
 *
 * "Every way each app is actually started" is now exactly two files per app,
 * its `package.json` script and its Dockerfile `CMD`. It used to look like
 * three: each app also carried a `railway.toml` with a `startCommand`, which
 * Railway never read — see
 * [ADR-47](../../docs/adrs/47-railway-configuration-lives-in-the-dashboard.md).
 * Those files are gone, so there is no longer an exclusion to explain here.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const OTEL_ESM_HOOK = '@opentelemetry/instrumentation/hook.mjs';

/** `--import <anything>/dist/instrument.js`, wherever the path is rooted. */
const INSTRUMENT_PRELOAD = /--import[",\s]+[^"\s]*dist\/instrument\.js/;

const read = (relativePath: string) =>
  readFileSync(join(REPO_ROOT, relativePath), 'utf8');

interface EsmApp {
  readonly name: string;
  readonly sourceRoot: string;
  /** Pathspecs excluded from the `require()` sweep, each with its reason. */
  readonly requireExclusions: readonly string[];
  /** Every command that starts the app, as [file, the line's marker]. */
  readonly startCommands: readonly (readonly [string, string])[];
}

const ESM_APPS: readonly EsmApp[] = [
  {
    name: 'apps/api',
    sourceRoot: 'apps/api/src',
    requireExclusions: [
      // The generated Prisma client really is CommonJS, and ships its own
      // package.json saying so.
      ':(exclude)apps/api/src/generated',
      // The specs used to be excluded too, on the grounds that jest compiled
      // them to CommonJS. They run as real ESM on vitest now (ADR-48), so
      // `require` throws there exactly as it does in src/ — the sweep covers
      // them, and the two module-registry tests that used `require` were
      // converted to dynamic imports.
    ],
    startCommands: [
      ['apps/api/package.json', '"start:prod"'],
      ['apps/api/Dockerfile', 'CMD'],
    ],
  },
  {
    name: 'apps/worker',
    sourceRoot: 'apps/worker/src',
    requireExclusions: [
      // This app's generated client lives outside src/ (see the schema's
      // `workerClient` generator), so there is nothing to exclude for it —
      // and, as for apps/api above, nothing to exclude for the suite either
      // now that it runs as real ESM (ADR-48).
    ],
    startCommands: [
      ['apps/worker/package.json', '"start"'],
      ['apps/worker/Dockerfile', 'CMD'],
    ],
  },
];

/**
 * Lines matching `require(` under `sourceRoot`, comments removed.
 *
 * `git grep` rather than a directory walk: it skips node_modules and dist for
 * free. Its exit status is load-bearing — 1 means "no matches" and anything
 * higher means the search did not run — so only 1 is allowed to pass. Treating
 * every failure as "nothing found" made this guard pass whenever it was
 * broken, which is the exact fail-open it exists to prevent.
 */
function findRequireCalls(app: EsmApp): string[] {
  let hits: string;

  try {
    hits = execFileSync(
      'git',
      [
        'grep',
        '-n',
        '-E',
        String.raw`(^|[^.\w])require\s*\(`,
        '--',
        app.sourceRoot,
        ...app.requireExclusions,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ).trim();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 1) {
      throw error;
    }
    hits = '';
  }

  // A comment *about* `require()` is not a call to it, and several of them now
  // explain why the call is gone.
  return hits
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
      const code = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1);
      return !/^\s*(\/\/|\*|\/\*)/.test(code);
    });
}

describe.each(ESM_APPS)(
  '$name is ESM, and its runtime contract holds',
  (app) => {
    it('declares itself a module', () => {
      const pkg = JSON.parse(read(`${app.name}/package.json`)) as {
        type?: string;
      };

      // If this ever goes back to CommonJS the guards below stop being about a
      // real risk, and should be deleted rather than left to pass vacuously.
      expect(pkg.type).toBe('module');
    });

    it('never calls require() in code that ships', () => {
      expect(findRequireCalls(app)).toEqual([]);
    }, 15_000);

    it.each(app.startCommands)(
      'starts %s with both OpenTelemetry preloads',
      (file, marker) => {
        const line = read(file)
          .split('\n')
          .find((candidate) => candidate.includes(marker));

        expect(line, `no line containing ${marker} in ${file}`).toBeDefined();
        // The hook, so CommonJS dependencies can be patched at all...
        expect(line).toContain(OTEL_ESM_HOOK);
        // ...and the instrumentation itself, preloaded, so the patching happens
        // before the app's own graph loads rather than after it.
        expect(line).toMatch(INSTRUMENT_PRELOAD);
      },
    );
  },
);

/**
 * One package-specific rule, because its failure mode is a crash loop rather
 * than a test failure.
 *
 * `pdf-parse`'s root entry treats an unset `module.parent` as "running as a
 * script" and reads a sample PDF from inside its own package directory. Under
 * CommonJS a `require` from another module set the parent, so the branch never
 * fired. Loaded through the ESM→CJS bridge it does, and `apps/worker` died at
 * boot with `ENOENT: ./test/data/05-versions-space.pdf`.
 *
 * `lib/pdf-parse.js` is what the root entry re-exports, without that branch.
 * The suite does not catch a change back, because the tests that touch this
 * path mock the module — so the first sign would be the deployed worker
 * failing to start.
 */
describe('pdf-parse is imported past its self-executing root entry', () => {
  it('is never imported from the package root', () => {
    let hits: string;

    try {
      hits = execFileSync(
        'git',
        ['grep', '-n', "from 'pdf-parse'", '--', 'apps/worker/src'],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      ).trim();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 1) {
        throw error;
      }
      hits = '';
    }

    // The ambient declaration in src/types/pdf-parse-lib.d.ts is allowed to
    // name the root: that is where the deep path borrows its types from.
    const offenders = hits
      .split('\n')
      .filter(Boolean)
      .filter(
        (line) => !line.startsWith('apps/worker/src/types/pdf-parse-lib.d.ts'),
      );

    expect(offenders).toEqual([]);
  }, 15_000);
});
