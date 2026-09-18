import { afterEach, describe, expect, it } from 'vitest';

import { makeUserFile } from '../../src/__tests__/fixtures/mock-activities.js';
import { startHarness, traits, type JobRuntimeHarness } from './harness.js';

/**
 * The spec's C3, asserted where it can actually go wrong.
 *
 * Qdrant point ids are random uuids, so writing a file's chunks twice *adds* a
 * second copy of each rather than replacing it. Under Temporal a crash resumed
 * past the completed step and this could not happen; under at-least-once
 * delivery it can, which is why the ingest deletes the file's existing vectors
 * before writing, on every run.
 *
 * A unit test can assert the call is in the handler. Only this one can assert
 * it survives a **redelivery** — the case that motivated it, and the case where
 * a handler that deleted somewhere other than the top of its write path would
 * still pass every other test in the repository.
 */

const INGEST = { fileId: 'file-1', orgId: 'org-1' };

function blockEventLoop(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // See the stalled-jobs suite: only a blocked loop loses its lock.
  }
}

/** The chunks handed to the vector store on each call. */
function writtenChunkCounts(harness: JobRuntimeHarness): number[] {
  return harness.activities.addDocumentsToVectorStore.mock.calls.map(
    ([args]) => (args as { docs: unknown[] }).docs.length,
  );
}

describe('ingest is idempotent', () => {
  let harness: JobRuntimeHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it("clears the file's chunks before every write, so a re-run does not double them", async () => {
    harness = await startHarness();
    harness.activities.getFileRecord.mockResolvedValue(makeUserFile());

    await harness.jobs.start('runFileEmbeddings', 'ingest-1', INGEST);
    await expect(harness.waitForRun('ingest-1')).resolves.toMatchObject({
      status: 'completed',
    });

    // A second run of the same file — a re-embed, or a folder-wide re-index.
    await harness.jobs.start('runFileEmbeddings', 'ingest-2', INGEST);
    await expect(harness.waitForRun('ingest-2')).resolves.toMatchObject({
      status: 'completed',
    });

    expect(harness.activities.deleteDocumentVectors).toHaveBeenCalledTimes(2);
    expect(harness.activities.deleteDocumentVectors).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: 'file-1',
    });

    const [first, second] = writtenChunkCounts(harness);
    // The collection holds what one run wrote, not the sum of two. If the
    // delete were missing this number would be identical *and* the store would
    // hold twice the points — which is why the order assertion below is the
    // other half of this test rather than a nicety.
    expect(second).toBe(first);

    const deletes =
      harness.activities.deleteDocumentVectors.mock.invocationCallOrder;
    const writes =
      harness.activities.addDocumentsToVectorStore.mock.invocationCallOrder;
    expect(deletes[0]).toBeLessThan(writes[0]);
    expect(deletes[1]).toBeLessThan(writes[1]);
  });

  /**
   * The redelivery half is BullMQ's, because a stalled job is: this test
   * provokes one by holding the event loop past the lock, and Temporal has no
   * lock to hold past. The re-run half above is the one that runs on both, and
   * it is the one that covers a re-embed or a folder-wide re-index.
   */
  it.runIf(traits().redeliversStalledJobs)(
    'clears them again when the same job is redelivered',
    async () => {
      let writes = 0;

      harness = await startHarness({
        lockDuration: 1_000,
        stalledInterval: 1_000,
      });
      harness.activities.getFileRecord.mockResolvedValue(makeUserFile());
      // The first write holds the loop past the lock, so the job is redelivered
      // after its chunks are already in the store — the exact state the spec
      // calls the highest-risk item in the port.
      harness.activities.addDocumentsToVectorStore.mockImplementation(() => {
        writes += 1;
        if (writes === 1) {
          blockEventLoop(3_000);
        }
        return Promise.resolve({ inputTokens: 50 });
      });

      await harness.jobs.start(
        'runFileEmbeddings',
        'ingest-redelivered',
        INGEST,
      );
      const run = await harness.waitForRun('ingest-redelivered', 60_000);

      expect(run.status).toBe('completed');
      expect(writes).toBe(2);
      // Twice, not once: the redelivery re-runs from the top, and its delete is
      // what keeps the first attempt's chunks from surviving beside the second's.
      expect(harness.activities.deleteDocumentVectors).toHaveBeenCalledTimes(2);

      const deletes =
        harness.activities.deleteDocumentVectors.mock.invocationCallOrder;
      const written =
        harness.activities.addDocumentsToVectorStore.mock.invocationCallOrder;
      expect(deletes[1]).toBeGreaterThan(written[0]);
      expect(deletes[1]).toBeLessThan(written[1]);
    },
  );
});
