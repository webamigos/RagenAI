import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  JOB_NAMES,
  type GenerateDocumentResult,
  type JobName,
  type JobPayloads,
} from '@ragenai/jobs';

import { makeUserFile } from '../../src/__tests__/fixtures/mock-activities.js';
import { startHarness, type JobRuntimeHarness } from './harness.js';

/**
 * Every job name, enqueued by a producer and completed by a worker, against a
 * real Redis.
 *
 * The unit suites run handlers directly and the Temporal suite runs them in a
 * time-skipping environment; neither proves that a job *reaches* a worker. On
 * BullMQ that is a real gap — a job name whose queue nobody consumes is
 * indistinguishable from a worker that is merely slow, which is the failure
 * this file exists to catch, and the reason the spec makes it the gate rather
 * than an e2e test (`e2e.yml` starts no worker at all).
 *
 * The activities are stubs. What is real here is the transport: the producer's
 * enqueue, the queue routing, the worker picking the job up, the handler's
 * `ctx.steps` proxy, and the result coming back through `getRun`.
 */

/**
 * One payload per job, by the type rather than by a list.
 *
 * `Record<JobName, …>` is what makes this exhaustive: a ninth job added to the
 * contract fails to compile here until someone decides what it is handed,
 * instead of quietly not being covered.
 */
const PAYLOADS: { [N in JobName]: JobPayloads[N] } = {
  runFileEmbeddings: { fileId: 'file-1', orgId: 'org-1' },
  scrapeWebsite: {
    url: 'https://example.com/docs',
    mode: 'scrape',
    orgId: 'org-1',
    projectId: 'proj-1',
  },
  generateDocument: {
    templateName: 'workshop-summary',
    rawInput: { notes: 'a workshop' },
    clientName: 'Acme',
    driveFolderId: 'folder-1',
    driveAccessToken: 'token-1',
    orgId: 'org-1',
    userId: 'user-1',
    userEmail: 'user@example.com',
  },
  reindexDocumentVersion: {
    orgId: 'org-1',
    fileId: 'file-1',
    fileName: 'test.txt',
    projectId: 'proj-1',
    userId: 'user-1',
    documentId: 'doc-1',
  },
  optimizeDocument: {
    jobId: 'opt-1',
    documentId: 'doc-1',
    orgId: 'org-1',
    projectId: 'proj-1',
    userId: 'user-1',
  },
  scoreDocument: {
    fileId: 'file-1',
    documentId: 'doc-1',
    orgId: 'org-1',
    projectId: 'proj-1',
    userId: 'user-1',
    fileName: 'test.txt',
    documentText: 'The document to score.',
  },
  cleanupDemoThreads: undefined,
  pruneAnalyticsRetrievals: undefined,
};

/** The activity that proves the pipeline ran, not merely that the job did. */
const EVIDENCE: Record<JobName, string> = {
  runFileEmbeddings: 'addDocumentsToVectorStore',
  scrapeWebsite: 'loadWebsite',
  generateDocument: 'uploadToGoogleDrive',
  reindexDocumentVersion: 'getDocumentContent',
  optimizeDocument: 'optimizeDocumentSuggestions',
  scoreDocument: 'scoreDocumentForRag',
  cleanupDemoThreads: 'deleteStaleDemoThreads',
  pruneAnalyticsRetrievals: 'pruneDocumentRetrievals',
};

describe('every job runs', () => {
  let harness: JobRuntimeHarness;

  beforeAll(async () => {
    harness = await startHarness();
    // The ingest reads its own row now (C4), so the row has to exist.
    harness.activities.getFileRecord.mockResolvedValue(makeUserFile());
  }, 30_000);

  afterAll(async () => {
    await harness?.close();
  });

  it.each(JOB_NAMES)('runs %s end to end', async (job) => {
    const runId = `run-${job}`;

    await harness.jobs.start(job, runId, PAYLOADS[job] as never);

    const run = await harness.waitForRun(runId);

    expect(
      run,
      `${job} did not complete on ${harness.runtimeName}: ${run.failure ?? ''}`,
    ).toMatchObject({ status: 'completed' });
    expect(harness.activities[EVIDENCE[job]]).toHaveBeenCalled();
  });

  it('hands a result back through the seam, which is what the docgen route polls', async () => {
    const runId = 'run-generateDocument-result';

    await harness.jobs.start(
      'generateDocument',
      runId,
      PAYLOADS.generateDocument,
    );
    const run = await harness.waitForRun(runId);

    expect(run.status).toBe('completed');
    // `/api/documents/status/[workflowId]` reads exactly this, and a runtime
    // that completed the job but dropped its return value would look like a
    // generation that never finished.
    expect(run.result as GenerateDocumentResult).toMatchObject({
      fileId: 'drive-1',
      fileUrl: 'https://drive.example/drive-1',
    });
  });

  it('answers "unknown" for a run it has never heard of', async () => {
    // Not `failed`. The route answers 404 for this, and collapsing the two
    // would tell a user their document failed when it merely aged out.
    await expect(harness.jobs.getRun('never-started')).resolves.toEqual({
      status: 'unknown',
    });
  });
});
