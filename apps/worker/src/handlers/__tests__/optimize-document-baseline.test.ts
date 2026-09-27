import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import { optimizeDocument } from '../optimize-document.js';

/**
 * Spec D3: "Analyse" in the Optimize tab is where a document gets its score,
 * since the menu's "Oceń dla RAG" is gone and upload does not score by
 * default. The handler scores only a document with no score yet.
 */
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

const payload = {
  jobId: 'job-1',
  documentId: 'doc-1',
  orgId: 'org-1',
  projectId: 'proj-1',
  userId: 'user-1',
};

describe('optimizeDocument — the baseline score', () => {
  it('scores a document that has none, and optimizes against that score', async () => {
    const activities = createMockActivities();
    activities.scoreDocumentBaseline.mockResolvedValue(58);

    await optimizeDocument(
      { ...payload, baseScore: null },
      context(activities),
    );

    expect(activities.scoreDocumentBaseline).toHaveBeenCalledWith({
      documentId: 'doc-1',
      orgId: 'org-1',
      projectId: 'proj-1',
      userId: 'user-1',
    });
    expect(activities.optimizeDocumentSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', baseScore: 58 }),
    );
    expect(
      activities.scoreDocumentBaseline.mock.invocationCallOrder[0],
    ).toBeLessThan(
      activities.optimizeDocumentSuggestions.mock.invocationCallOrder[0],
    );
  });

  // An existing score is what the user has been comparing against; scoring
  // again with no edit would move it, and spend a call.
  it('keeps an existing score and makes no scoring call', async () => {
    const activities = createMockActivities();

    await optimizeDocument({ ...payload, baseScore: 71 }, context(activities));

    expect(activities.scoreDocumentBaseline).not.toHaveBeenCalled();
    expect(activities.optimizeDocumentSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ baseScore: 71 }),
    );
  });

  it('still suggests when scoring fails', async () => {
    const activities = createMockActivities();
    activities.scoreDocumentBaseline.mockRejectedValue(new Error('model down'));

    await optimizeDocument(payload, context(activities));

    expect(activities.optimizeDocumentSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ baseScore: null }),
    );
    expect(activities.sendSuccessNotification).toHaveBeenCalled();
  });
});
