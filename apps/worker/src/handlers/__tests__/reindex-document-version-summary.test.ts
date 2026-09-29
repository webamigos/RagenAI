import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import type { Document } from '../../types/Document.js';
import { reindexDocumentVersion } from '../reindex-document-version.js';

/**
 * Re-indexing deletes every point of the file, the ADR-16 summary chunk
 * included, so it has to put a summary back — of the new text, and masked.
 */
const payload = {
  orgId: 'org-1',
  fileId: 'file-1',
  fileName: 'umowa.md',
  projectId: 'proj-1',
  userId: 'user-1',
  documentId: 'doc-1',
};

function run(configure?: (a: ReturnType<typeof createMockActivities>) => void) {
  const activities = createMockActivities();
  activities.maskPii.mockImplementation(({ docs }: { docs: Document[] }) =>
    Promise.resolve(
      docs.map((d) => ({ ...d, pageContent: `masked:${d.pageContent}` })),
    ),
  );
  activities.generateDocumentSummary.mockResolvedValue('Streszczenie wersji.');
  configure?.(activities);
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return { activities, done: reindexDocumentVersion(payload, ctx) };
}

const summaryPatches = (activities: ReturnType<typeof createMockActivities>) =>
  activities.mergeFileMetadata.mock.calls
    .map(([arg]) => (arg as { patch: Record<string, unknown> }).patch)
    .filter((patch) => 'summary' in patch);

describe('reindexDocumentVersion — the summary chunk', () => {
  it('summarises the masked version text and indexes the summary first', async () => {
    const { activities, done } = run();
    await expect(done).resolves.toBe('file-1');

    const input = activities.generateDocumentSummary.mock.calls[0]![0] as {
      documentText: string;
      orgId: string;
    };
    expect(input.orgId).toBe('org-1');
    expect(input.documentText.startsWith('masked:')).toBe(true);

    const prepared = activities.prepareMetadata.mock.calls[0]![0] as {
      docs: Document[];
    };
    expect(prepared.docs[0]).toEqual({
      pageContent: 'Streszczenie wersji.',
      metadata: { chunk_type: 'summary' },
    });
    expect(summaryPatches(activities)).toEqual([
      { summary: 'Streszczenie wersji.' },
    ]);
  });

  it('indexes the version without a summary when summarising fails', async () => {
    const { activities, done } = run((a) =>
      a.generateDocumentSummary.mockRejectedValue(new Error('rate limited')),
    );
    await expect(done).resolves.toBe('file-1');

    const prepared = activities.prepareMetadata.mock.calls[0]![0] as {
      docs: Document[];
    };
    expect(
      prepared.docs.some((d) => d.metadata?.chunk_type === 'summary'),
    ).toBe(false);
    expect(summaryPatches(activities)).toEqual([]);
    const statuses = activities.updateEmbeddingStatus.mock.calls.map(
      ([arg]) => (arg as { status: string }).status,
    );
    expect(statuses.at(-1)).toBe('COMPLETED');
  });

  it('keeps the version COMPLETED when the summary cannot be stored', async () => {
    const { activities, done } = run((a) =>
      a.mergeFileMetadata.mockImplementation(
        ({ patch }: { patch: Record<string, unknown> }) =>
          'summary' in patch
            ? Promise.reject(new Error('db down'))
            : Promise.resolve(undefined),
      ),
    );
    await expect(done).resolves.toBe('file-1');
    const statuses = activities.updateEmbeddingStatus.mock.calls.map(
      ([arg]) => (arg as { status: string }).status,
    );
    expect(statuses).not.toContain('FAILED');
  });
});
