import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every runtime the seam knows is run by some suite, somewhere.
 *
 * This guards a fail-open shape, which is why it is a test rather than a
 * comment: a runtime that stops being run, a renamed workflow file, or a third
 * adapter added to `WorkerRuntime` without a job to run it all leave CI
 * *green*. `@ragenai/jobs`'s own tests would still pass, `Jobs Integration`
 * would still pass, and the only signal that an engine had stopped being
 * tested would be its absence — which is precisely what nobody notices.
 *
 * It is the same class of failure as the path globs in
 * `scripts/ci/check-config-path-globs.mjs`, and it has the same answer: assert
 * the config against the thing it is supposed to cover.
 *
 * The spec (§8.3) states the stake plainly — a runtime nothing runs in CI is
 * not supported, it is abandoned with a package name.
 *
 * **G3 split the answer across two repositories, and the guard had to be
 * rewritten rather than deleted.** It used to read `jobs-parity.yml`'s
 * `runtime: [bullmq, temporal]` matrix and require it to equal the union. That
 * workflow is gone: `@ragenai/jobs-temporal` moved to
 * `webamigos/ragen-enterprise`, so this repository cannot run the Temporal leg
 * — it has no adapter to run it with — and a matrix of one is the
 * `Jobs Integration` job. What survives is the property that mattered: for
 * every member of the union, *something* runs the integration suite against
 * it, and where is written down.
 *
 * So a runtime is either exercised **here**, by a CI job that names it, or
 * recorded in `EXERCISED_ELSEWHERE` with the repository and workflow that does.
 * The second is weaker and says so: this repository cannot see that job go
 * red. It is not nothing, though — adding a third runtime to the union now
 * fails until somebody either wires a job or states, in a file that is
 * reviewed, that they chose not to.
 */
const ROOT = join(import.meta.dirname, '..', '..');

const SEAM = join(ROOT, 'packages', 'jobs', 'src', 'runtime.ts');
const CI = join(ROOT, '.github', 'workflows', 'ci.yml');

/**
 * Runtimes this repository cannot exercise, and who does.
 *
 * An entry is a claim about another repository, which no test here can check.
 * That is the cost G3 accepted — the spec's §8.6 called it "the parity job
 * moves with the package, and that is when this promise starts costing
 * something". What the entry buys is that the cost is visible: a runtime
 * silently dropped from CI and a runtime deliberately run elsewhere no longer
 * look the same in this file.
 */
const EXERCISED_ELSEWHERE: Record<string, string> = {
  temporal:
    'webamigos/ragen-enterprise — .github/workflows/temporal-parity.yml, which ' +
    'checks this repository out, builds its @ragenai/jobs-temporal against ' +
    "this checkout's @ragenai/jobs, splices it into node_modules and runs " +
    '`npm run worker:test:jobs` with WORKER_RUNTIME=temporal.',
};

/**
 * The runtimes, read from the union rather than imported.
 *
 * `WorkerRuntime` is a type, so there is nothing to import at runtime — the
 * `KNOWN` array beside it is deliberately not exported. Reading the source as
 * text is this repository's idiom for architecture tests anyway, and it has the
 * property that matters here: adding a member to the union is what makes this
 * test start demanding an answer.
 */
function declaredRuntimes(): string[] {
  const source = readFileSync(SEAM, 'utf8');
  const union = /export type WorkerRuntime =\s*([^;]+);/.exec(source);

  expect(
    union,
    `no WorkerRuntime union in ${SEAM.replace(`${ROOT}/`, '')} — if the seam moved, this guard has to move with it`,
  ).not.toBeNull();

  return [...union![1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}

/** Runtimes some job in this repository names as `WORKER_RUNTIME`. */
function runtimesExercisedHere(): string[] {
  const workflow = readFileSync(CI, 'utf8');

  // Only a job that also runs the integration suite counts. A `WORKER_RUNTIME`
  // set by a job that boots an app — e2e does — proves the app starts, not
  // that the engine drains a queue.
  expect(
    workflow,
    'no job in ci.yml runs `npm run worker:test:jobs` — the integration suite ' +
      'is the only thing in this repository that puts a job through an engine',
  ).toContain('npm run worker:test:jobs');

  return [
    ...new Set(
      [...workflow.matchAll(/^\s*WORKER_RUNTIME:\s*([a-z]+)\s*$/gm)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

describe('every job runtime is exercised', () => {
  it('runs the integration suite against each runtime the seam declares', () => {
    const declared = declaredRuntimes();
    const here = runtimesExercisedHere();

    // Guard on the guard: a regex that stopped matching would make the
    // difference below empty and the assertion vacuous.
    expect(
      declared.length,
      'the WorkerRuntime union parsed as empty',
    ).toBeGreaterThan(0);
    expect(
      here,
      'no job in ci.yml names a WORKER_RUNTIME, so this guard would accept ' +
        'any claim in EXERCISED_ELSEWHERE without checking one of them',
    ).not.toEqual([]);

    const unaccounted = declared.filter(
      (runtime) =>
        !here.includes(runtime) && EXERCISED_ELSEWHERE[runtime] === undefined,
    );

    expect(
      unaccounted,
      'a runtime the seam offers and nothing runs is abandoned, not supported. ' +
        'Either add a CI job here that sets WORKER_RUNTIME and runs ' +
        '`npm run worker:test:jobs`, or record in EXERCISED_ELSEWHERE which ' +
        'repository does it.',
    ).toEqual([]);
  });

  it('claims nothing about a runtime this repository does exercise', () => {
    // An entry that duplicates a job here is a stale claim: it would survive
    // that job being deleted and keep this test green, which is the fail-open
    // shape the whole file exists against.
    const here = runtimesExercisedHere();

    expect(
      Object.keys(EXERCISED_ELSEWHERE).filter((runtime) =>
        here.includes(runtime),
      ),
      'these runtimes are exercised by a job in this repository, so the ' +
        'EXERCISED_ELSEWHERE entry is redundant — and would outlive the job.',
    ).toEqual([]);
  });

  it('exercises the default runtime here, not elsewhere', () => {
    // The one that must never become somebody else's job. `bullmq` is what an
    // install runs (ADR-44), and a `Jobs Integration` that had drifted to
    // another engine — or to none — would leave the shipped runtime tested by
    // nothing while the name still said otherwise.
    expect(
      runtimesExercisedHere(),
      'ci.yml no longer names bullmq as a WORKER_RUNTIME. The default runtime ' +
        'is the one this repository must test itself.',
    ).toContain('bullmq');
  });
});
