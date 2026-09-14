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
 * The hook therefore has to be on *every* way the app is started, and those
 * live in three files that nothing else keeps in step.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const OTEL_ESM_HOOK = '@opentelemetry/instrumentation/hook.mjs';

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
    } catch {
      // git grep exits non-zero when it matches nothing — the passing case.
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
    ['apps/api/railway.toml', 'startCommand'],
  ])('starts %s with the OpenTelemetry ESM loader hook', (file, marker) => {
    const line = read(file)
      .split('\n')
      .find((candidate) => candidate.includes(marker));

    expect(line, `no line containing ${marker} in ${file}`).toBeDefined();
    expect(line).toContain(OTEL_ESM_HOOK);
  });
});
