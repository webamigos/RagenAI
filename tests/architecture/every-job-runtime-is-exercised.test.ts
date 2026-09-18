import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every runtime the seam knows is run by the parity job.
 *
 * This guards a fail-open shape, which is why it is a test rather than a
 * comment: a runtime dropped from the matrix, a renamed workflow file, or a
 * third adapter added to `WorkerRuntime` without a job to run it all leave CI
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
 */
const ROOT = join(import.meta.dirname, '..', '..');

const SEAM = join(ROOT, 'packages', 'jobs', 'src', 'runtime.ts');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'jobs-parity.yml');
const BACKEND_SEAM = join(ROOT, 'packages', 'env', 'src', 'provider-seams.ts');

/**
 * The runtimes, read from the union rather than imported.
 *
 * `WorkerRuntime` is a type, so there is nothing to import at runtime — the
 * `KNOWN` array beside it is deliberately not exported. Reading the source as
 * text is this repository's idiom for architecture tests anyway, and it has the
 * property that matters here: adding a member to the union is what makes this
 * test start demanding a matrix entry.
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

describe('every job runtime is exercised', () => {
  it('runs the integration suite against each runtime the seam declares', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');
    const legs = [...workflow.matchAll(/^\s+runtime:\s*(\S+)\s*$/gm)].map(
      (match) => match[1],
    );

    expect(
      legs,
      'the parity workflow has no `runtime:` entries — without them, this job tests whichever engine the default happens to be',
    ).not.toEqual([]);

    expect(
      [...new Set(legs)].sort(),
      'a runtime the seam offers and CI never runs is abandoned, not supported — add a leg to the matrix in .github/workflows/jobs-parity.yml',
    ).toEqual(declaredRuntimes());
  });

  /**
   * BullMQ is two datastores, and the suite found them behaving differently
   * the first time it was pointed at the second one. A matrix that ran only
   * the default backend would report "BullMQ passes" while never touching the
   * configuration this seam exists to allow.
   *
   * Read from `packages/env`'s seam rather than from a list here, so adding a
   * third backend fails this test until a leg runs it — the same rule the
   * runtimes get above, one level down.
   */
  it('runs every BullMQ backend the seam declares', () => {
    const seam = readFileSync(BACKEND_SEAM, 'utf8');
    const declared = [
      ...seam.matchAll(/BULLMQ_BACKEND_SEAM[\s\S]*?variants:\s*\{/g),
    ].length;

    expect(
      declared,
      'no BULLMQ_BACKEND_SEAM in packages/env — if the seam moved, this guard has to move with it',
    ).toBe(1);

    const backends = [
      ...readFileSync(WORKFLOW, 'utf8').matchAll(/^\s+backend:\s*(\S+)\s*$/gm),
    ]
      .map((match) => match[1].replace(/'/g, ''))
      .filter((value) => value !== '');

    expect([...new Set(backends)].sort()).toEqual(['postgres', 'redis']);
  });

  it('selects the runtime the way a deployment does', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');

    // Not a flag only the tests know about. If the matrix stopped reaching the
    // suite through `WORKER_RUNTIME`, both legs would run the default engine
    // and the job would report parity it never checked.
    expect(
      workflow,
      'the matrix has to reach the suite through WORKER_RUNTIME, which is what a deployment sets',
    ).toContain('WORKER_RUNTIME: ${{ matrix.runtime }}');
  });
});
