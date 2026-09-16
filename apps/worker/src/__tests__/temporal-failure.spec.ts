import { JobFailure } from '@ragenai/jobs';
import { ApplicationFailure } from '@temporalio/common';
import { describe, expect, it, vi } from 'vitest';

import {
  asApplicationFailure,
  translatingFailures,
} from '../temporal-failure.js';

/**
 * The activity half of the seam's error translation, which had none until the
 * image stopped shipping the Temporal SDK.
 *
 * Before this, an activity imported `ApplicationFailure` itself — engine code
 * inside something that runs on both engines. The alternative a seam demands,
 * throwing `JobFailure`, is *worse* on Temporal unless something translates:
 * a plain `Error` out of an activity is retryable, so a non-retryable failure
 * would be retried under the activity's own policy (five attempts, up to a
 * minute of backoff) before failing anyway.
 */
describe('translatingFailures', () => {
  it('marks a non-retryable JobFailure non-retryable for Temporal', async () => {
    const wrapped = translatingFailures({
      loadWebsite: () =>
        Promise.reject(JobFailure.nonRetryable('Invalid crawl mode')),
    });

    await expect(wrapped.loadWebsite()).rejects.toMatchObject({
      nonRetryable: true,
      message: 'Invalid crawl mode',
    });
  });

  it('leaves a retryable JobFailure retryable', async () => {
    const wrapped = translatingFailures({
      flaky: () => Promise.reject(new JobFailure('upstream hiccup')),
    });

    await expect(wrapped.flaky()).rejects.toMatchObject({
      nonRetryable: false,
      message: 'upstream hiccup',
    });
  });

  /**
   * Everything the worker throws that is not a `JobFailure` — a Postgres
   * error, a TypeError — has to reach Temporal unchanged, or its own retry
   * policy stops applying to the failures it was written for.
   */
  it('passes anything else through untouched', async () => {
    const original = new Error('connection reset');
    const wrapped = translatingFailures({
      download: () => Promise.reject(original),
    });

    await expect(wrapped.download()).rejects.toBe(original);
  });

  it('returns what the activity returns, with its arguments', async () => {
    const activity = vi.fn().mockResolvedValue({ chunks: 3 });
    const wrapped = translatingFailures({ parse: activity });

    await expect(wrapped.parse('file-1' as never)).resolves.toEqual({
      chunks: 3,
    });
    expect(activity).toHaveBeenCalledWith('file-1');
  });

  it('wraps every activity it is given', () => {
    const wrapped = translatingFailures({
      a: () => Promise.resolve(1),
      b: () => Promise.resolve(2),
    });

    expect(Object.keys(wrapped)).toEqual(['a', 'b']);
  });
});

describe('asApplicationFailure', () => {
  // `type` is what the ingest workflows' catch blocks read to tell an
  // already-recorded cancellation from every other failure.
  it('preserves the failure type', () => {
    const translated = asApplicationFailure(
      JobFailure.nonRetryable('cancelled', { type: 'IngestCancelled' }),
    );

    expect(translated).toBeInstanceOf(ApplicationFailure);
    expect((translated as ApplicationFailure).type).toBe('IngestCancelled');
  });
});
