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

  // Spec C3: a step that throws through its retries is a failed document,
  // not a failed run — and what it records carries no error text.
  it('records a document whose step threw, and carries on', async () => {
    const activities = createMockActivities();
    const thrown = new TypeError('Cannot read the prompt: „Regulamin pracy…”');
    activities.extractDocumentCandidates
      .mockRejectedValueOnce(thrown)
      .mockResolvedValueOnce(extracted(100));
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b'] },
      context(activities),
    );
    expect(result).toMatchObject({ extracted: 1, failed: 1, tokens: 100 });
    expect(activities.recordExtractionStepFailed).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: 'a',
      runId: 'run-1',
      reason: 'the extraction step failed (TypeError)',
    });
  });

  it('fails the run when the failure cannot even be recorded', async () => {
    const activities = createMockActivities();
    activities.extractDocumentCandidates.mockRejectedValue(new Error('db'));
    activities.recordExtractionStepFailed.mockRejectedValue(new Error('db'));
    await expect(
      brainExtract({ orgId: 'org-1', fileIds: ['a'] }, context(activities)),
    ).rejects.toThrow('db');
  });

  // Spec C2: new pages change what is orphaned and unowned.
  it('reconciles the computed findings once, after every document', async () => {
    const activities = createMockActivities();
    const order: string[] = [];
    activities.extractDocumentCandidates.mockImplementation(async () => {
      order.push('extract');
      return extracted(10);
    });
    activities.reconcileBrainFindings.mockImplementation(async () => {
      order.push('reconcile');
      return { created: 3, updated: 1, resolved: 2, holding: 4 };
    });
    const result = await brainExtract(
      { orgId: 'org-1', fileIds: ['a', 'b'] },
      context(activities),
    );
    expect(order).toEqual(['extract', 'extract', 'reconcile']);
    expect(activities.reconcileBrainFindings).toHaveBeenCalledWith({
      orgId: 'org-1',
    });
    expect(result.findings).toEqual({ created: 3, updated: 1, resolved: 2 });
  });

  it('reports findings as null, and still succeeds, when reconciling fails', async () => {
    const activities = createMockActivities();
    activities.reconcileBrainFindings.mockRejectedValue(new Error('db'));
    const ctx = context(activities);
    const result = await brainExtract({ orgId: 'org-1', fileIds: ['a'] }, ctx);
    expect(result).toMatchObject({ extracted: 1, findings: null });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('not reconciled'),
    );
  });

  it('does not reconcile when Brain is off', async () => {
    const activities = createMockActivities();
    activities.startBrainExtractRun.mockResolvedValue({
      enabled: false,
      maxDocuments: 10,
      maxTokens: 1e6,
    });
    await brainExtract({ orgId: 'org-1', fileIds: ['a'] }, context(activities));
    expect(activities.reconcileBrainFindings).not.toHaveBeenCalled();
  });

  describe('the contradiction check (C1)', () => {
    it('compares the documents that extracted, on the tokens left', async () => {
      const activities = createMockActivities();
      activities.startBrainExtractRun.mockResolvedValue({
        enabled: true,
        maxDocuments: 10,
        maxTokens: 1000,
      });
      activities.extractDocumentCandidates
        .mockResolvedValueOnce(extracted(300))
        .mockResolvedValueOnce({
          status: 'failed',
          pagesCreated: 0,
          unverifiedClaims: 0,
          tokens: 100,
        });
      activities.detectContradictions.mockResolvedValue({
        pairs: 3,
        raised: 1,
        cleared: 0,
        failed: 0,
        notJudged: 0,
        tokens: 50,
      });
      const result = await brainExtract(
        { orgId: 'org-1', fileIds: ['a', 'b'], userId: 'user-1' },
        context(activities),
      );
      expect(activities.detectContradictions).toHaveBeenCalledWith({
        orgId: 'org-1',
        fileIds: ['a'],
        userId: 'user-1',
        maxTokens: 600,
        runId: 'run-1',
      });
      expect(result.tokens).toBe(450);
      expect(result.contradictions).toEqual({
        pairs: 3,
        raised: 1,
        cleared: 0,
        failed: 0,
        notJudged: 0,
      });
    });

    it('runs between extraction and reconciliation', async () => {
      const activities = createMockActivities();
      const order: string[] = [];
      activities.extractDocumentCandidates.mockImplementation(async () => {
        order.push('extract');
        return extracted(10);
      });
      activities.detectContradictions.mockImplementation(async () => {
        order.push('contradictions');
        return {
          pairs: 0,
          raised: 0,
          cleared: 0,
          failed: 0,
          notJudged: 0,
          tokens: 0,
        };
      });
      activities.reconcileBrainFindings.mockImplementation(async () => {
        order.push('reconcile');
        return { created: 0, updated: 0, resolved: 0, holding: 0 };
      });
      await brainExtract(
        { orgId: 'org-1', fileIds: ['a'] },
        context(activities),
      );
      expect(order).toEqual(['extract', 'contradictions', 'reconcile']);
    });

    it('does not run when nothing was extracted', async () => {
      const activities = createMockActivities();
      activities.extractDocumentCandidates.mockResolvedValue({
        status: 'failed',
        pagesCreated: 0,
        unverifiedClaims: 0,
        tokens: 10,
      });
      const result = await brainExtract(
        { orgId: 'org-1', fileIds: ['a'] },
        context(activities),
      );
      expect(activities.detectContradictions).not.toHaveBeenCalled();
      expect(result.contradictions).toBeNull();
    });

    it('does not run when extraction spent the run tokens', async () => {
      const activities = createMockActivities();
      activities.startBrainExtractRun.mockResolvedValue({
        enabled: true,
        maxDocuments: 10,
        maxTokens: 100,
      });
      activities.extractDocumentCandidates.mockResolvedValue(extracted(100));
      await brainExtract(
        { orgId: 'org-1', fileIds: ['a'] },
        context(activities),
      );
      expect(activities.detectContradictions).not.toHaveBeenCalled();
    });

    it('reports null, and still reconciles, when the check fails', async () => {
      const activities = createMockActivities();
      activities.detectContradictions.mockRejectedValue(new Error('provider'));
      const result = await brainExtract(
        { orgId: 'org-1', fileIds: ['a'] },
        context(activities),
      );
      expect(result.contradictions).toBeNull();
      expect(activities.reconcileBrainFindings).toHaveBeenCalled();
    });
  });
});
