import { afterEach, describe, expect, it } from 'vitest';

import { JobFailure } from '@ragenai/jobs';

import {
  expectFailedWith,
  startHarness,
  type JobRuntimeHarness,
} from './harness.js';

/**
 * A step's retry policy, enforced against a real queue.
 *
 * The policies live in the handlers and were written for Temporal, which
 * enforced them per activity. BullMQ has no equivalent, so `runStep` enforces
 * them in process — which means the numbers are only as true as something
 * checks. The unit tests check `runStep` in isolation; this checks that the
 * policy the handler declares is the one a job delivered by a queue actually
 * gets, and that BullMQ is not *also* retrying underneath.
 *
 * `scoreDocument` is the subject because its policy starts at two seconds.
 * The nightly jobs back off from thirty, and a test that waited for those
 * would be measuring its own patience.
 */

const SCORE_PAYLOAD = {
  fileId: 'file-1',
  documentId: 'doc-1',
  orgId: 'org-1',
  projectId: 'proj-1',
  userId: 'user-1',
  fileName: 'test.txt',
  documentText: 'The document to score.',
};

describe('step retries', () => {
  let harness: JobRuntimeHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('retries a failed step and completes, without re-running the whole job', async () => {
    harness = await startHarness();

    harness.activities.scoreDocumentForRag
      .mockRejectedValueOnce(new Error('provider blip'))
      .mockResolvedValue({ score: 7 });

    await harness.jobs.start('scoreDocument', 'retry-1', SCORE_PAYLOAD);
    const run = await harness.waitForRun('retry-1');

    expect(run.status).toBe('completed');
    expect(harness.activities.scoreDocumentForRag).toHaveBeenCalledTimes(2);
    // The step retried, not the job: a job-level retry would have re-run every
    // step before this one too, and on an ingest that means re-downloading and
    // re-parsing the document to reach the one call that failed.
    expect(harness.activities.mergeFileMetadata).toHaveBeenCalledTimes(1);
  });

  it("gives up after the policy's attempts and fails the run once", async () => {
    harness = await startHarness();

    harness.activities.scoreDocumentForRag.mockRejectedValue(
      new Error('provider down'),
    );

    await harness.jobs.start('scoreDocument', 'retry-2', SCORE_PAYLOAD);
    const run = await harness.waitForRun('retry-2', 60_000);

    expectFailedWith(run, 'provider down');
    // Three, which is `scoreDocument`'s `maximumAttempts` — not six, which is
    // what a job BullMQ also retried would produce.
    expect(harness.activities.scoreDocumentForRag).toHaveBeenCalledTimes(3);
  });

  it('does not retry a step that said not to', async () => {
    harness = await startHarness();

    harness.activities.scoreDocumentForRag.mockRejectedValue(
      JobFailure.nonRetryable('unsupported document'),
    );

    await harness.jobs.start('scoreDocument', 'retry-3', SCORE_PAYLOAD);
    const run = await harness.waitForRun('retry-3');

    expectFailedWith(run, 'unsupported document');
    // The whole point of `retryable: false` surviving the port. Retrying an
    // unsupported file type turns one clear failure into several slow ones,
    // and on this runtime the translation to `UnrecoverableError` is what
    // keeps the queue from redelivering it as well.
    expect(harness.activities.scoreDocumentForRag).toHaveBeenCalledTimes(1);
  });
});
