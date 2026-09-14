import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `apps/api` is `"type": "module"`. Two things that used to be free stopped
 * being free the moment it was, and both fail *quietly*.
 *
 * 1. **`require` is not defined in ESM.** It still typechecks — `@types/node`
 *    declares it globally — so tsc, eslint and the whole test suite stay green
 *    while the call throws at runtime. `instrument.ts` had fourteen of them
 *    inside a `try`/`catch` that logged the ReferenceError and carried on, so
 *    the app booted with every exporter and every auto-instrumentation missing
 *    and nothing but one line in the startup log to say so.
 *
 * 2. **OpenTelemetry's patching needs a loader hook under ESM.**
 *    `registerInstrumentations` hooks CommonJS `require` calls, which the ESM
 *    loader never makes. Without
 *    `--import @opentelemetry/instrumentation/hook.mjs` the SDK initialises,
 *    reports "OpenTelemetry initialized", exports spans it creates itself —
 *    and traces no HTTP, no Postgres and no Prisma. There is no error, only an
 *    empty trace view, which is indistinguishable from a quiet service.
 *
 * 3. **Top-level await does not fix the ordering.** Making `instrument.ts` an
 *    async module does not make main.ts's *sibling* imports wait for it —
 *    Nest, Prisma and `pg` finish loading while it is still suspended, so the
 *    patching lands after the modules it means to patch. The file has to be
 *    preloaded with `--import ./dist/instrument.js`, which runs it to
 *    completion before the entry's graph is touched.
 *
 * Both flags therefore have to be on every way the app is actually started.
 * `railway.toml` is deliberately *not* checked here: the deployed service's
 * root directory is `/`, Railway looks for a config file there and finds none,
 * and the file's own `restartPolicyMaxRetries = 3` against the deployed 10
 * proves it is never read. Asserting against it would be guarding a file with
 * no effect.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const OTEL_ESM_HOOK = '@opentelemetry/instrumentation/hook.mjs';

/** `--import <anything>/dist/instrument.js`, wherever the path is rooted. */
const INSTRUMENT_PRELOAD = /--import[",\s]+[^"\s]*dist\/instrument\.js/;

const read = (relativePath: string) =>
  readFileSync(join(REPO_ROOT, relativePath), 'utf8');

describe('apps/api is ESM, and its runtime contract holds', () => {
  it('declares itself a module', () => {
    const pkg = JSON.parse(read('apps/api/package.json')) as {
      type?: string;
    };

    // If this ever goes back to CommonJS the two guards below stop being
    // about a real risk, and should be deleted rather than left to pass
    // vacuously.
    expect(pkg.type).toBe('module');
  });

  it('never calls require() in code that ships', () => {
    // `git grep` rather than a directory walk: it skips node_modules and dist
    // for free. Two exclusions, both deliberate:
    //
    // - `src/generated` is the Prisma client, which really is CommonJS and
    //   ships its own package.json saying so.
    // - the specs, which jest compiles down to CommonJS through
    //   `tsconfig.spec.json`, so `require` exists there and a couple of module
    //   -registry tests rely on it. If the suite ever moves to jest's ESM
    //   runtime, drop this exclusion — those calls break on the same day.
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
          'apps/api/src',
          ':(exclude)apps/api/src/generated',
          ':(exclude)apps/api/src/**/__tests__/**',
          ':(exclude)apps/api/src/**/*.spec.ts',
        ],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      ).trim();
    } catch (error) {
      // `git grep` exits 1 for "no matches", which is the passing case, and 2+
      // for a real failure — a bad pathspec, not a repository, git missing.
      // Catching both made this guard pass whenever it could not run, which is
      // the exact fail-open it exists to prevent.
      const status = (error as { status?: number }).status;
      if (status !== 1) {
        throw error;
      }
      hits = '';
    }

    // A comment *about* `require()` is not a call to it, and this file's whole
    // point is that several of them now explain why the call is gone.
    const calls = hits
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        const code = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1);
        return !/^\s*(\/\/|\*|\/\*)/.test(code);
      });

    expect(calls).toEqual([]);
  }, 15_000);

  it.each([
    ['apps/api/package.json', '"start:prod"'],
    ['apps/api/Dockerfile', 'CMD'],
  ])('starts %s with both OpenTelemetry preloads', (file, marker) => {
    const line = read(file)
      .split('\n')
      .find((candidate) => candidate.includes(marker));

    expect(line, `no line containing ${marker} in ${file}`).toBeDefined();
    // The hook, so CommonJS dependencies can be patched at all...
    expect(line).toContain(OTEL_ESM_HOOK);
    // ...and the instrumentation itself, preloaded, so the patching happens
    // before the app's own graph loads rather than after it.
    expect(line).toMatch(INSTRUMENT_PRELOAD);
  });
});
