import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobFailure } from '@ragenai/jobs';

import { createJobContext, runStep, DEFAULT_MAX_ATTEMPTS } from '../context.js';

/**
 * Temporal enforced these policies itself. Here the adapter does, from the
 * same numbers the handlers already declare — so the risk is not that the loop
 * is wrong but that it is *differently* wrong from the engine it replaces.
 */

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const policy = (over: Record<string, unknown> = {}) => ({
  retry: {
    initialInterval: '1 ms',
    maximumInterval: '1 ms',
    backoffCoefficient: 1,
    maximumAttempts: 3,
    ...over,
  },
  startToCloseTimeout: '1 minute',
});

beforeEach(() => vi.clearAllMocks());

describe('runStep', () => {
  it('returns the first success without retrying', async () => {
    const call = vi.fn(async () => 'ok');

    expect(await runStep('load', call, policy(), log)).toBe('ok');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('retries up to the policy’s attempts, then gives up', async () => {
    const call = vi.fn(async () => {
      throw new Error('flaky');
    });

    await expect(runStep('load', call, policy(), log)).rejects.toThrow('flaky');
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('stops as soon as an attempt succeeds', async () => {
    let n = 0;
    const call = vi.fn(async () => {
      n += 1;
      if (n < 2) {
        throw new Error('flaky');
      }
      return 'ok';
    });

    expect(await runStep('load', call, policy(), log)).toBe('ok');
    expect(call).toHaveBeenCalledTimes(2);
  });

  /**
   * The distinction that has to survive the port. An unsupported file type is
   * a deliberate stop; retrying it turns one clear failure into several slow
   * ones and delays the FAILED status a user is waiting for.
   */
  it('does not retry a failure the handler marked non-retryable', async () => {
    const call = vi.fn(async () => {
      throw JobFailure.nonRetryable('unsupported file type');
    });

    await expect(runStep('check', call, policy(), log)).rejects.toThrow(
      'unsupported file type',
    );
    expect(call).toHaveBeenCalledTimes(1);
  });

  // A retryable JobFailure is an ordinary failure — only `retryable: false`
  // is special, and reading the flag backwards would be invisible.
  it('does retry a JobFailure that did not ask to stop', async () => {
    const call = vi.fn(async () => {
      throw new JobFailure('transient');
    });

    await expect(runStep('check', call, policy(), log)).rejects.toThrow(
      'transient',
    );
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('abandons an attempt that outlasts the step timeout', async () => {
    const call = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 5_000)),
    );

    await expect(
      runStep(
        'parse',
        call,
        { ...policy({ maximumAttempts: 1 }), startToCloseTimeout: '5 ms' },
        log,
      ),
    ).rejects.toThrow(/exceeded/);
  });

  /**
   * Temporal's answer to an unset `maximumAttempts` is "forever", which
   * in-process would be a job that never finishes and never fails while
   * holding its lock. A finite cap is the safer disagreement, and it is
   * written down rather than implied.
   */
  it('caps an unspecified attempt count instead of retrying forever', async () => {
    const call = vi.fn(async () => {
      throw new Error('always');
    });

    await expect(
      runStep(
        'load',
        call,
        { retry: { initialInterval: '1 ms' }, startToCloseTimeout: '1 minute' },
        log,
      ),
    ).rejects.toThrow('always');
    expect(call).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });
});

describe('the context a handler is given', () => {
  const job = {
    id: 'reembed-1',
    updateProgress: vi.fn(async () => undefined),
  } as never;

  const deps = {
    activities: { loadText: vi.fn(async () => 'text') },
    log,
    isCancelled: vi.fn(async () => false),
  };

  it('exposes the producer’s run id, which the row already holds', () => {
    expect(createJobContext(job, deps).runId).toBe('reembed-1');
  });

  it('routes a step call to the registered activity', async () => {
    const ctx = createJobContext(job, deps);
    const { loadText } = ctx.steps<{ loadText: () => Promise<string> }>(
      policy(),
    );

    expect(await loadText()).toBe('text');
  });

  /**
   * A bare proxy would resolve an unregistered activity to `undefined`, and
   * the pipeline would carry on with nothing several steps before anything
   * looked wrong.
   */
  it('rejects a step the worker never registered, by name', async () => {
    const ctx = createJobContext(job, deps);
    const { missingActivity } = ctx.steps<{
      missingActivity: () => Promise<void>;
    }>(policy());

    await expect(missingActivity()).rejects.toThrow(/missingActivity/);
  });

  it('asks the injected reader about cancellation', async () => {
    const ctx = createJobContext(job, deps);

    await ctx.checkCancelled({ fileId: 'f1', orgId: 'o1' });

    expect(deps.isCancelled).toHaveBeenCalledWith({
      fileId: 'f1',
      orgId: 'o1',
    });
  });

  // Progress is a convenience; a Redis blip while reporting it must not fail a
  // job that is otherwise fine.
  it('does not let a failed progress report reach the handler', () => {
    const failing = {
      id: 'x',
      updateProgress: vi.fn(async () => {
        throw new Error('redis gone');
      }),
    } as never;

    expect(() =>
      createJobContext(failing, deps).progress('embedding'),
    ).not.toThrow();
  });
});
