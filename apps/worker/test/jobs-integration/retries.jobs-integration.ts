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
 * `generateDocument` is the subject because its first step's policy starts
 * at two seconds, with three attempts. The nightly jobs back off from thirty,
 * and a test that waited for those would be measuring its own patience. (It
 * was `scoreDocument` until that job lost its last producer and was removed.)
 */

const GENERATE_PAYLOAD = {
  templateName: 'workshop-summary',
  rawInput: { notes: 'a workshop' },
  clientName: 'Acme',
  driveFolderId: 'folder-1',
  driveAccessToken: 'token-1',
  orgId: 'org-1',
  userId: 'user-1',
  userEmail: 'user@example.com',
};

describe('step retries', () => {
  let harness: JobRuntimeHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('retries a failed step and completes, without re-running the whole job', async () => {
    harness = await startHarness();

    harness.activities.generateDocumentContent.mockRejectedValueOnce(
      new Error('provider blip'),
    );

    await harness.jobs.start('generateDocument', 'retry-1', GENERATE_PAYLOAD);
    const run = await harness.waitForRun('retry-1');

    expect(run.status).toBe('completed');
    expect(harness.activities.generateDocumentContent).toHaveBeenCalledTimes(2);
    // The step retried, not the job: the steps after it ran once. A job-level
    // retry re-runs everything, and on an ingest that means re-downloading and
    // re-parsing the document to reach the one call that failed.
    expect(harness.activities.createDocxFile).toHaveBeenCalledTimes(1);
    expect(harness.activities.uploadToGoogleDrive).toHaveBeenCalledTimes(1);
  });

  it("gives up after the policy's attempts and fails the run once", async () => {
    harness = await startHarness();

    harness.activities.generateDocumentContent.mockRejectedValue(
      new Error('provider down'),
    );

    await harness.jobs.start('generateDocument', 'retry-2', GENERATE_PAYLOAD);
    const run = await harness.waitForRun('retry-2', 60_000);

    expectFailedWith(run, 'provider down');
    // Three, which is the step's `maximumAttempts` — not six, which is what a
    // job BullMQ also retried would produce.
    expect(harness.activities.generateDocumentContent).toHaveBeenCalledTimes(3);
  });

  it('does not retry a step that said not to', async () => {
    harness = await startHarness();

    harness.activities.generateDocumentContent.mockRejectedValue(
      JobFailure.nonRetryable('unsupported template'),
    );

    await harness.jobs.start('generateDocument', 'retry-3', GENERATE_PAYLOAD);
    const run = await harness.waitForRun('retry-3');

    expectFailedWith(run, 'unsupported template');
    // The whole point of `retryable: false` surviving the port. Retrying an
    // unsupported input turns one clear failure into several slow ones, and
    // on this runtime the translation to `UnrecoverableError` is what keeps
    // the queue from redelivering it as well.
    expect(harness.activities.generateDocumentContent).toHaveBeenCalledTimes(1);
  });
});
