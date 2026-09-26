import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import { scoreDocument } from '../score-document.js';

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
  fileId: 'file-1',
  documentId: 'doc-1',
  orgId: 'org-1',
  projectId: null,
  fileName: 'procedura.docx',
  documentText: 'Tekst dokumentu.',
};

describe('scoreDocument', () => {
  it('scores and stores the result when scoring is on', async () => {
    const activities = createMockActivities();
    activities.scoreDocumentForRag.mockResolvedValue({ total: 60 } as never);

    await scoreDocument(payload, context(activities));

    expect(activities.scoreDocumentForRag).toHaveBeenCalledTimes(1);
    expect(activities.mergeFileMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-1',
        patch: expect.objectContaining({ ragScore: { total: 60 } }),
      }),
    );
  });

  // A job queued before an operator turned the key off: the command refuses
  // new ones, and this one must not spend the call either.
  it('scores nothing and says nothing when the organization has scoring off', async () => {
    const activities = createMockActivities();
    activities.isRagScoringEnabled.mockResolvedValue(false);

    await scoreDocument(payload, context(activities));

    expect(activities.isRagScoringEnabled).toHaveBeenCalledWith({
      orgId: 'org-1',
    });
    expect(activities.scoreDocumentForRag).not.toHaveBeenCalled();
    expect(activities.mergeFileMetadata).not.toHaveBeenCalled();
    expect(activities.sendSuccessNotification).not.toHaveBeenCalled();
  });
});
