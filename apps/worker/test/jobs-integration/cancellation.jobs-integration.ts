import { afterEach, describe, expect, it } from 'vitest';

import { makeUserFile } from '../../src/__tests__/fixtures/mock-activities.js';
import { ParsingStatus } from '../../src/types/UserFile.js';
import { startHarness, type JobRuntimeHarness } from './harness.js';

/**
 * Cancellation, which is two mechanisms wearing one name.
 *
 * `requestCancel` stops a job the worker has **not** picked up, and only that.
 * A run already in flight stops because the row says CANCELLED and the handler
 * reads it at its next checkpoint — cooperative, not preemptive. The split is
 * the spec's §4, and it is worth an integration test because each half is
 * invisible to the other's unit tests: the unit suites never queue anything,
 * and a queue test with no handler never reaches a checkpoint.
 */

const INGEST = { fileId: 'file-1', orgId: 'org-1' };

describe('cancellation', () => {
  let harness: JobRuntimeHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('drops a queued run before a worker can start it', async () => {
    // Nothing consuming yet, which is the only state `requestCancel` acts on.
    harness = await startHarness({ consume: false });
    harness.activities.getFileRecord.mockResolvedValue(makeUserFile());

    await harness.jobs.start('runFileEmbeddings', 'cancel-queued', INGEST);
    await harness.jobs.requestCancel('cancel-queued');

    harness.startConsuming();
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(harness.activities.getFileRecord).not.toHaveBeenCalled();
    // The run is gone rather than failed: nothing ran, so there is nothing to
    // report a failure about.
    await expect(harness.jobs.getRun('cancel-queued')).resolves.toEqual({
      status: 'unknown',
    });
  });

  it('leaves a finished run alone', async () => {
    harness = await startHarness();
    harness.activities.getFileRecord.mockResolvedValue(makeUserFile());

    await harness.jobs.start('runFileEmbeddings', 'cancel-late', INGEST);
    await harness.waitForRun('cancel-late');

    // The command that races a run to its end must not throw — on Temporal
    // this used to be a `WorkflowNotFoundError` reaching the user as a failed
    // cancel of a file that had already finished successfully.
    await expect(
      harness.jobs.requestCancel('cancel-late'),
    ).resolves.toBeUndefined();
    await expect(harness.jobs.getRun('cancel-late')).resolves.toMatchObject({
      status: 'completed',
    });
  });

  it('stops a running ingest at its checkpoint, recording CANCELLED', async () => {
    harness = await startHarness();
    harness.activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'readme.txt' }),
    );
    // The row already says cancelled, which is what the command writes.
    harness.activities.isIngestCancelled.mockResolvedValue(true);

    await harness.jobs.start('runFileEmbeddings', 'cancel-running', INGEST);
    const run = await harness.waitForRun('cancel-running');

    expect(run.status).toBe('failed');
    expect(run.failure).toContain('Embedding cancelled by user');
    expect(harness.activities.updateParsingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ParsingStatus.CANCELLED }),
    );
    // Proves the checkpoint landed before the expensive step rather than after
    // a wasted parse.
    expect(harness.activities.loadText).not.toHaveBeenCalled();
  });

  it('asks the injected read about the file, not about the run', async () => {
    // On this runtime `ctx.checkCancelled` is a function the worker injects
    // rather than an activity, because the adapter has no database. It still
    // has to be asked the same question: `(fileId, orgId)` is the row's unique
    // key, and `workflow_id` carries no index.
    harness = await startHarness();
    harness.activities.getFileRecord.mockResolvedValue(makeUserFile());
    harness.activities.isIngestCancelled.mockResolvedValue(true);

    await harness.jobs.start('runFileEmbeddings', 'cancel-subject', INGEST);
    await harness.waitForRun('cancel-subject');

    expect(harness.activities.isIngestCancelled).toHaveBeenCalledWith({
      fileId: 'file-1',
      orgId: 'org-1',
    });
  });
});
