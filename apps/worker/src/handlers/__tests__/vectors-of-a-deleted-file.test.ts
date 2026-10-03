import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { EmbeddingStatus } from '../../types/UserFile.js';
import {
  INGEST_CANCELLED_FAILURE_TYPE,
  withdrawVectorsIfIngestEnded,
} from '../ingest-cancellation.js';
import { runFileEmbeddings } from '../parse-and-embed.js';
import { reindexDocumentVersion } from '../reindex-document-version.js';
import { scrapeWebsite } from '../scrape-website.js';
import { WebsiteLoaderMode } from '../../types/WebsiteLoaderMode.js';

/**
 * A file deleted while its ingest is writing vectors must not keep them.
 *
 * Deleting a file removes its row, then its vectors by filter. A pipeline past
 * its last checkpoint wrote its chunks after that delete had run, and nothing
 * removed them: on a local stack, a file deleted mid-embedding had 0 points
 * right after the delete and 422 a minute later — gone from the knowledge base,
 * still retrieved and cited in chat. Each case here deletes the file at the
 * one moment the old checkpoints could not see: during the vector write.
 */

/** `ctx.checkCancelled` that answers "no" until the vectors are written. */
function deletedDuringWrite(
  activities: ReturnType<typeof createMockActivities>,
) {
  let deleted = false;
  activities.addDocumentsToVectorStore.mockImplementation(async () => {
    deleted = true;
  });
  return vi.fn(async () => deleted);
}

function ctxWith(
  activities: ReturnType<typeof createMockActivities>,
  checkCancelled: JobContext['checkCancelled'],
): JobContext {
  return {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled,
  };
}

const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
  fn.mock.invocationCallOrder[0] ?? Infinity;

const statuses = (activities: ReturnType<typeof createMockActivities>) =>
  activities.updateEmbeddingStatus.mock.calls.map(
    ([arg]) => (arg as { status: string }).status,
  );

describe('withdrawVectorsIfIngestEnded', () => {
  it('leaves the vectors of a file that is still there', async () => {
    const deleteVectors = vi.fn();
    expect(
      await withdrawVectorsIfIngestEnded({
        isCancelled: async () => false,
        deleteVectors,
      }),
    ).toBe(false);
    expect(deleteVectors).not.toHaveBeenCalled();
  });

  it('takes them out when the file went away', async () => {
    const deleteVectors = vi.fn();
    expect(
      await withdrawVectorsIfIngestEnded({
        isCancelled: async () => true,
        deleteVectors,
      }),
    ).toBe(true);
    expect(deleteVectors).toHaveBeenCalledTimes(1);
  });
});

describe('runFileEmbeddings — a file deleted during the vector write', () => {
  function run() {
    const activities = createMockActivities();
    activities.loadText.mockResolvedValue([
      { pageContent: 'Treść dokumentu.', metadata: {} },
    ]);
    activities.splitText.mockResolvedValue([
      { pageContent: 'Treść dokumentu.', metadata: {} },
    ]);
    activities.checkMimeType.mockResolvedValue({
      mime: 'text/plain',
      ext: 'txt',
    });
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'umowa.txt' }),
    );
    const checkCancelled = deletedDuringWrite(activities);
    return {
      activities,
      done: runFileEmbeddings(
        { fileId: 'f', orgId: 'o' },
        ctxWith(activities, checkCancelled),
      ),
    };
  }

  it('removes the vectors it just wrote, after writing them', async () => {
    const { activities, done } = run();
    await done.catch(() => undefined);

    const deletes = activities.deleteDocumentVectors.mock.invocationCallOrder;
    expect(
      deletes.some((at) => at > order(activities.addDocumentsToVectorStore)),
    ).toBe(true);
    expect(activities.deleteDocumentVectors).toHaveBeenLastCalledWith({
      orgId: 'o',
      fileId: 'f',
    });
  });

  it('ends as a cancellation, never as COMPLETED', async () => {
    const { activities, done } = run();
    await expect(done).rejects.toMatchObject({
      type: INGEST_CANCELLED_FAILURE_TYPE,
    });
    expect(statuses(activities)).not.toContain(EmbeddingStatus.COMPLETED);
    expect(statuses(activities)).toContain(EmbeddingStatus.CANCELLED);
  });
});

describe('reindexDocumentVersion — a file deleted during the vector write', () => {
  function run() {
    const activities = createMockActivities();
    const checkCancelled = deletedDuringWrite(activities);
    return {
      activities,
      done: reindexDocumentVersion(
        {
          orgId: 'org-1',
          fileId: 'file-1',
          fileName: 'umowa.md',
          projectId: 'proj-1',
          userId: 'user-1',
          documentId: 'doc-1',
        },
        ctxWith(activities, checkCancelled),
      ),
    };
  }

  it('removes the vectors it wrote and marks nothing', async () => {
    const { activities, done } = run();
    await expect(done).resolves.toBe('file-1');

    const deletes = activities.deleteDocumentVectors.mock.invocationCallOrder;
    expect(
      deletes.some((at) => at > order(activities.addDocumentsToVectorStore)),
    ).toBe(true);
    expect(statuses(activities)).not.toContain(EmbeddingStatus.COMPLETED);
  });
});

describe('scrapeWebsite — a page deleted during the vector write', () => {
  it('removes the vectors it wrote and ends as a cancellation', async () => {
    const activities = createMockActivities();
    const checkCancelled = deletedDuringWrite(activities);
    const done = scrapeWebsite(
      {
        url: 'https://example.com',
        mode: WebsiteLoaderMode.SCRAPE,
        orgId: 'org-1',
        projectId: 'proj-1',
      },
      ctxWith(activities, checkCancelled),
    );

    await expect(done).rejects.toMatchObject({
      type: INGEST_CANCELLED_FAILURE_TYPE,
    });
    const deletes = activities.deleteDocumentVectors.mock.invocationCallOrder;
    expect(
      deletes.some((at) => at > order(activities.addDocumentsToVectorStore)),
    ).toBe(true);
    expect(statuses(activities)).not.toContain(EmbeddingStatus.COMPLETED);
  });
});
