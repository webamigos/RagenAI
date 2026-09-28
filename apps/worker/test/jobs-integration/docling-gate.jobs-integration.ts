import { afterEach, describe, expect, it } from 'vitest';

import { makeUserFile } from '../../src/__tests__/fixtures/mock-activities.js';
import {
  expectFailedWith,
  startHarness,
  type JobRuntimeHarness,
} from './harness.js';

/**
 * Spec 2026-09-26-docling-under-load, B1, on real queues: under
 * DOCLING_STRICT a Docling that is down is waited out in its own step, and
 * the parse step's attempts are not spent while it is. The waiting itself is
 * unit-tested beside `wait-for-docling.ts`; this is the runtime carrying the
 * new step between the two it sits between.
 */

const INGEST = { fileId: 'file-1', orgId: 'org-1' };

function strict(harness: JobRuntimeHarness) {
  harness.activities.getFileRecord.mockResolvedValue(
    makeUserFile({ fileName: 'regulamin.pdf' }),
  );
  harness.activities.getDocumentParser.mockResolvedValue({
    parser: 'docling',
    strict: true,
  });
}

describe('the Docling gate', () => {
  let harness: JobRuntimeHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('waits out a Docling that is down, then parses once', async () => {
    harness = await startHarness();
    strict(harness);
    // "Down" for a moment: the step resolves only once Docling answers.
    harness.activities.waitForDocling.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ outcome: 'available', waitedMs: 300 }),
            300,
          ),
        ),
    );

    await harness.jobs.start('runFileEmbeddings', 'gate-1', INGEST);
    await expect(harness.waitForRun('gate-1')).resolves.toMatchObject({
      status: 'completed',
    });

    expect(harness.activities.waitForDocling).toHaveBeenCalledTimes(1);
    // One attempt at the parse: none spent while Docling was away.
    expect(harness.activities.loadDocling).toHaveBeenCalledTimes(1);
    expect(harness.activities.addDocumentsToVectorStore).toHaveBeenCalled();
  });

  it('fails the run once, with the outage in the message, when Docling never returns', async () => {
    harness = await startHarness();
    strict(harness);
    harness.activities.waitForDocling.mockResolvedValue({
      outcome: 'timed-out',
      waitedMs: 30 * 60_000,
      since: '2026-09-28T09:00:00.000Z',
    });

    await harness.jobs.start('runFileEmbeddings', 'gate-2', INGEST);
    const run = await harness.waitForRun('gate-2');

    expectFailedWith(run, 'unavailable since 2026-09-28T09:00:00.000Z');
    expect(harness.activities.loadDocling).not.toHaveBeenCalled();
    // Not retried as a job: the gate already waited as long as it should.
    expect(harness.activities.waitForDocling).toHaveBeenCalledTimes(1);
  });
});
