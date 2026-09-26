import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { runFileEmbeddings } from '../parse-and-embed.js';

/**
 * A re-run replaces the text a stored score was about. DOCX files first parsed
 * as raw bytes scored 0; re-processed into readable text, they kept showing
 * "RAG: 0" because the new scoring call returned nothing and the old value
 * was left in place.
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

function scorePatches(activities: ReturnType<typeof createMockActivities>) {
  return activities.mergeFileMetadata.mock.calls
    .map(([arg]) => (arg as { patch: Record<string, unknown> }).patch)
    .filter((patch) => 'ragScore' in patch);
}

describe('runFileEmbeddings — RAG score', () => {
  it('stores a new score', async () => {
    const activities = createMockActivities();
    const score = { total: 74 };
    activities.scoreDocumentForRag.mockResolvedValue(score as never);
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'procedura.docx' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(scorePatches(activities)).toEqual([
      { ragScore: score, ragScoredAt: expect.any(String) },
    ]);
  });

  it('clears the previous score when scoring returns nothing', async () => {
    const activities = createMockActivities();
    activities.scoreDocumentForRag.mockResolvedValue(null);
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'procedura.docx' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(scorePatches(activities)).toEqual([
      { ragScore: null, ragScoredAt: null },
    ]);
  });

  // `ragReadinessScore` off, set in apps/admin: no model call at all, and the
  // score of the previous text is cleared rather than kept for later.
  it('makes no scoring call when the organization has scoring off', async () => {
    const activities = createMockActivities();
    activities.isRagScoringEnabled.mockResolvedValue(false);
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'procedura.docx' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(activities.isRagScoringEnabled).toHaveBeenCalledWith({
      orgId: 'org-1',
    });
    expect(activities.scoreDocumentForRag).not.toHaveBeenCalled();
    expect(scorePatches(activities)).toEqual([
      { ragScore: null, ragScoredAt: null },
    ]);
  });

  // Reading the key is best-effort like the score itself: an ingest that
  // cannot read it still finishes, unscored.
  it('still finishes the ingest when the key cannot be read', async () => {
    const activities = createMockActivities();
    activities.isRagScoringEnabled.mockRejectedValue(new Error('db down'));
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'procedura.docx' }),
    );

    await expect(
      runFileEmbeddings(
        { fileId: 'file-1', orgId: 'org-1' },
        context(activities),
      ),
    ).resolves.toBeDefined();
    expect(activities.scoreDocumentForRag).not.toHaveBeenCalled();
  });
});
