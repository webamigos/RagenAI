import { describe, expect, it } from 'vitest';

import { isMissingTemporalPackage, withCause } from '../missing-package.js';

function resolutionError(message: string, code = 'ERR_MODULE_NOT_FOUND') {
  return Object.assign(new Error(message), { code });
}

/**
 * The classifier that keeps "this build has no Temporal" from being said about
 * failures that are nothing of the sort.
 *
 * `worker.ts` and `jobs.ts` load the Temporal runtime through `await
 * import(...)`, which is what lets the image ship without the SDK. A `catch`
 * around that sees every failure inside those modules, not just the missing
 * package — so without this, a TypeError at module scope would be reported as
 * a build-configuration problem, and whoever hit it would go looking in the
 * Dockerfile.
 */
describe('isMissingTemporalPackage', () => {
  it('recognises the SDK the image leaves out', () => {
    expect(
      isMissingTemporalPackage(
        resolutionError(
          "Cannot find package '@temporalio/worker' imported from /app/apps/worker/dist/temporal-runtime.js",
        ),
      ),
    ).toBe(true);
  });

  it('recognises the adapter workspace', () => {
    expect(
      isMissingTemporalPackage(
        resolutionError("Cannot find package '@ragenai/jobs-temporal'"),
      ),
    ).toBe(true);
  });

  // CommonJS resolution reports the other spelling, and a dependency of the
  // SDK can still be the thing that is missing.
  it('recognises the CommonJS code too', () => {
    expect(
      isMissingTemporalPackage(
        resolutionError(
          "Cannot find module '@temporalio/common'",
          'MODULE_NOT_FOUND',
        ),
      ),
    ).toBe(true);
  });

  /**
   * The case that matters most. A missing package that is *not* Temporal's is
   * a broken image or a bad install, and answering "build it with the
   * devDependencies" sends someone to the wrong file.
   */
  it('does not claim a different missing package is Temporal', () => {
    expect(
      isMissingTemporalPackage(
        resolutionError("Cannot find package 'sharp' imported from /app"),
      ),
    ).toBe(false);
  });

  it('does not claim a failure inside the module is a missing package', () => {
    expect(
      isMissingTemporalPackage(
        new TypeError(
          "Cannot read properties of undefined (reading 'connect')",
        ),
      ),
    ).toBe(false);
  });

  it('survives something that is not an Error at all', () => {
    expect(isMissingTemporalPackage('@temporalio/worker')).toBe(false);
    expect(isMissingTemporalPackage(undefined)).toBe(false);
  });
});

describe('withCause', () => {
  // `apps/worker` compiles against lib ES2021, where `new Error(msg, { cause })`
  // is not declared — Node has the property since 16.9, so only the type is
  // missing. Losing the cause would leave a sentence where a stack was.
  it('attaches the original failure and returns the same error', () => {
    const original = resolutionError(
      "Cannot find package '@temporalio/worker'",
    );
    const wrapped = new Error('this build has no Temporal SDK');

    const returned = withCause(wrapped, original);

    expect(returned).toBe(wrapped);
    expect((returned as Error & { cause?: unknown }).cause).toBe(original);
  });
});
