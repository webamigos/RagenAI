import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The worker image ships one runtime, and nothing on the other one may be
 * loaded to find that out.
 *
 * `@temporalio/*` are devDependencies of `apps/worker` since the spec's E6, so
 * `npm ci --omit=dev` leaves them out of the running image — 182 MB of SDK,
 * most of it `core-bridge`'s prebuilt native binaries. That is safe exactly as
 * long as every module that imports one is reached *only* when
 * `WORKER_RUNTIME=temporal` selects it. A single import on a shared path is a
 * container that cannot start, and it fails in the image alone: a root install
 * hoists the SDK, so every local run and every CI job resolves it happily.
 *
 * It is not hypothetical. `activities/loaders/load-website.ts` imported
 * `ApplicationFailure` for one validation, and that one line — in an activity
 * both engines run — is what pinned `@temporalio/workflow` into an image that
 * never runs Temporal. It throws the seam's `JobFailure` now, and
 * `temporal-runtime.ts` translates at the activity boundary.
 *
 * The allowed files are the ones `worker.ts` reaches through
 * `await import('./temporal-runtime.js')`, plus the workflow modules Temporal
 * bundles for its own sandbox. Tests are exempt: they run from a root install,
 * where the SDK is always present.
 *
 * **Those three paths are the end state, not a waypoint.** They used to be
 * described as what would shrink when the spec's G3 moved the adapter out.
 * G3 has happened — `@ragenai/jobs-temporal` is in
 * `webamigos/ragen-enterprise` — and G2 decided the *bootstrap* stays here,
 * because `temporal-runtime.ts` imports the worker's 69 activity modules and
 * `src/workflows/` imports its eight handlers: moving them would mean
 * compiling the pipeline in that repository, which is the `apps/worker-lite`
 * shape ADR-44 rejected. So this list does not get shorter, and it is the
 * whole of what keeps `@temporalio/*` off a BullMQ start.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..');

const WORKER_SRC = join(REPO_ROOT, 'apps', 'worker', 'src');

/** Modules only a Temporal start loads. Paths are repo-relative. */
const TEMPORAL_ONLY = [
  join('apps', 'worker', 'src', 'temporal-runtime.ts'),
  join('apps', 'worker', 'src', 'temporal-failure.ts'),
  join('apps', 'worker', 'src', 'workflows') + sep,
];

/**
 * `temporal-failure.ts` imports the SDK, so importing *it* from a shared
 * module loads the SDK just as surely as naming the package — one indirection
 * further down, where a text search for `@temporalio` finds nothing. This
 * nearly happened while answering a review: two helpers went in beside its
 * `ApplicationFailure` import and were then imported from `worker.ts`.
 */
const CARRIES_THE_SDK = /\.\/temporal-failure\.js|\.\.\/temporal-failure\.js/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.ts$/.test(entry.name)) {
      yield full;
    }
  }
}

const IS_TEST = /(^|\/)__tests__\//;

const sources = [...walk(WORKER_SRC)]
  .map((path) => relative(REPO_ROOT, path))
  .filter((path) => !IS_TEST.test(path.split(sep).join('/')));

/**
 * Every edge that makes Node resolve a package, and none that does not.
 *
 * Three shapes load it: a value import, a bare side-effect import
 * (`import '@temporalio/worker'`, which runs the module for nothing else), and
 * a re-export (`export { x } from …`, which is an import with a different
 * name). `import type` and `export type` are erased by tsc and load nothing,
 * so flagging them would be a false positive on the one spelling that is
 * always safe — and would push someone toward `// eslint-disable`-shaped
 * workarounds rather than the fix.
 */
function loadsPackage(pattern: string): RegExp {
  return new RegExp(
    // import … from 'pkg' / export … from 'pkg', but not `import type`
    `^\\s*(?:import|export)\\s+(?!type\\s)[^;]*?from\\s*['"]${pattern}['"]` +
      // import 'pkg'
      `|^\\s*import\\s*['"]${pattern}['"]`,
    'm',
  );
}

const STATIC_IMPORT = loadsPackage('@temporalio\\/[^\'"]+');

describe('the Temporal SDK stays on the Temporal path', () => {
  it('finds the worker sources it is meant to police', () => {
    // A rename that empties this list would make the assertion below pass over
    // nothing, which is the failure mode every guard here is written against.
    expect(sources.length).toBeGreaterThan(50);
    expect(
      sources.some((path) => TEMPORAL_ONLY.some((ok) => path.startsWith(ok))),
    ).toBe(true);
  });

  it('is imported only by modules a BullMQ start never loads', () => {
    const offenders = sources.filter((path) => {
      if (TEMPORAL_ONLY.some((allowed) => path.startsWith(allowed))) {
        return false;
      }
      const source = readFileSync(join(REPO_ROOT, path), 'utf8');
      return STATIC_IMPORT.test(source) || CARRIES_THE_SDK.test(source);
    });

    expect(
      offenders,
      'These files import @temporalio/* and are reachable on the BullMQ path, ' +
        'which is the only runtime the worker image installs. The container ' +
        'would fail at module resolution before running a line — and only in ' +
        'the image, since a root install hoists the SDK for every local run.\n' +
        'Throw the seam’s JobFailure instead, or move the module behind ' +
        "worker.ts's dynamic import of ./temporal-runtime.js.",
    ).toEqual([]);
  });
});
