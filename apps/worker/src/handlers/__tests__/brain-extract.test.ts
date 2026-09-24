import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import { brainExtract } from '../brain-extract.js';

function context(activities: ReturnType<typeof createMockActivities>) {
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return ctx;
}

const extracted = (tokens: number, pagesCreated = 1) => ({
  status: 'extracted' as const,
  pagesCreated,
  unverifiedClaims: 1,
  tokens,
});

describe('brainExtract', () => {
  // Spec: every Brain job checks the flag, at run time.
  it('does nothing when the organization has Brain off', async () => {
    const activities = createMockActivities();
    activities.startBrainExtractRun.mockResolvedValue({
      enabled: false,
      maxDocuments: 10,
      maxTokens: 1e6,
    });
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b'] },
      context(activities),
    );
    expect(result).toMatchObject({ skipped: 'disabled', notAttempted: 2 });
    expect(activities.extractDocumentCandidates).not.toHaveBeenCalled();
  });

  it('extracts each document once, even if named twice', async () => {
    const activities = createMockActivities();
    activities.extractDocumentCandidates.mockResolvedValue(extracted(100, 2));
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b', 'a'] },
      context(activities),
    );
    expect(activities.extractDocumentCandidates).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      skipped: null,
      extracted: 2,
      pagesCreated: 4,
      tokens: 200,
    });
  });

  // Spec failure mode: one document's failure never fails the batch.
  it('carries on past a document that fails', async () => {
    const activities = createMockActivities();
    activities.extractDocumentCandidates
      .mockResolvedValueOnce({
        status: 'failed',
        pagesCreated: 0,
        unverifiedClaims: 0,
        tokens: 50,
      })
      .mockResolvedValueOnce(extracted(100));
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b'] },
      context(activities),
    );
    expect(result).toMatchObject({ extracted: 1, failed: 1, tokens: 150 });
  });

  it('stops at the run document ceiling and counts the rest', async () => {
    const activities = createMockActivities();
    activities.startBrainExtractRun.mockResolvedValue({
      enabled: true,
      maxDocuments: 2,
      maxTokens: 1e6,
    });
    activities.extractDocumentCandidates.mockResolvedValue(extracted(10));
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b', 'c', 'd'] },
      context(activities),
    );
    expect(activities.extractDocumentCandidates).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ extracted: 2, notAttempted: 2 });
  });

  // The token ceiling is the run's: each document gets what is left.
  it('hands each document what is left of the run tokens', async () => {
    const activities = createMockActivities();
    activities.startBrainExtractRun.mockResolvedValue({
      enabled: true,
      maxDocuments: 10,
      maxTokens: 1000,
    });
    activities.extractDocumentCandidates
      .mockResolvedValueOnce(extracted(600))
      .mockResolvedValueOnce(extracted(400));
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b', 'c'] },
      context(activities),
    );
    const handed = activities.extractDocumentCandidates.mock.calls.map(
      ([input]) => (input as { maxTokens: number }).maxTokens,
    );
    expect(handed).toEqual([1000, 400]);
    expect(result).toMatchObject({ extracted: 2, notAttempted: 1 });
  });

  it('stops after a document that ran out of budget, counting it as not attempted', async () => {
    const activities = createMockActivities();
    activities.extractDocumentCandidates
      .mockResolvedValueOnce(extracted(100))
      .mockResolvedValueOnce({
        status: 'budget_exhausted',
        pagesCreated: 0,
        unverifiedClaims: 0,
        tokens: 900,
      });
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b', 'c'] },
      context(activities),
    );
    expect(activities.extractDocumentCandidates).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ extracted: 1, notAttempted: 2 });
  });

  it('passes the run id and the starter to each document', async () => {
    const activities = createMockActivities();
    await brainExtract(
      { orgId: 'org-1', fileIds: ['a'], userId: 'user-1' },
      context(activities),
    );
    expect(activities.extractDocumentCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        fileId: 'a',
        userId: 'user-1',
        runId: 'run-1',
      }),
    );
  });
});
