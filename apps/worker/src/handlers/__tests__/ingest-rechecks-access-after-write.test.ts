import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { EmbeddingStatus } from '../../types/UserFile.js';
import { runFileEmbeddings } from '../parse-and-embed.js';
import { reindexDocumentVersion } from '../reindex-document-version.js';
import { scrapeWebsite } from '../scrape-website.js';
import { WebsiteLoaderMode } from '../../types/WebsiteLoaderMode.js';

/**
 * An ingest takes `accessible_by` before it writes, and the write can take
 * minutes. A share revoked in between would be written back by the older
 * snapshot, which is the lag #1245 is about arriving by another door. Each
 * writer therefore reads the principals again once its points exist and
 * rewrites them if they changed.
 */

function ctxFor(activities: ReturnType<typeof createMockActivities>) {
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return ctx;
}

const at = (fn: { mock: { invocationCallOrder: number[] } }) =>
  fn.mock.invocationCallOrder[0] ?? Infinity;

const completedAt = (activities: ReturnType<typeof createMockActivities>) =>
  activities.updateEmbeddingStatus.mock.calls
    .map(([arg], i) => ({
      status: (arg as { status: string }).status,
      order: activities.updateEmbeddingStatus.mock.invocationCallOrder[i],
    }))
    .find((call) => call.status === EmbeddingStatus.COMPLETED)?.order;

function expectCheckedAfterTheWrite(
  activities: ReturnType<typeof createMockActivities>,
  ids: { orgId: string; fileId: string },
) {
  expect(activities.syncFileAccess).toHaveBeenCalledWith({
    ...ids,
    // What the ingest wrote, from `computeFileAccessPrincipals`.
    unlessEqualTo: ['user:owner-1'],
  });
  expect(at(activities.syncFileAccess)).toBeGreaterThan(
    at(activities.addDocumentsToVectorStore),
  );
  // And before the file reads as finished, so a failure is a failed ingest.
  expect(at(activities.syncFileAccess)).toBeLessThan(
    completedAt(activities) ?? -Infinity,
  );
}

describe('runFileEmbeddings', () => {
  it('re-reads the principals after writing, before COMPLETED', async () => {
    const activities = createMockActivities();
    activities.loadText.mockResolvedValue([
      { pageContent: 'Treść.', metadata: {} },
    ]);
    activities.splitText.mockResolvedValue([
      { pageContent: 'Treść.', metadata: {} },
    ]);
    activities.checkMimeType.mockResolvedValue({
      mime: 'text/plain',
      ext: 'txt',
    });
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'umowa.txt' }),
    );

    await runFileEmbeddings({ fileId: 'f', orgId: 'o' }, ctxFor(activities));

    expectCheckedAfterTheWrite(activities, { orgId: 'o', fileId: 'f' });
  });

  it('is not skipped when the check itself fails — the file ends FAILED, not COMPLETED', async () => {
    const activities = createMockActivities();
    activities.loadText.mockResolvedValue([
      { pageContent: 'Treść.', metadata: {} },
    ]);
    activities.splitText.mockResolvedValue([
      { pageContent: 'Treść.', metadata: {} },
    ]);
    activities.checkMimeType.mockResolvedValue({
      mime: 'text/plain',
      ext: 'txt',
    });
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'umowa.txt' }),
    );
    activities.syncFileAccess.mockRejectedValue(new Error('qdrant down'));

    await expect(
      runFileEmbeddings({ fileId: 'f', orgId: 'o' }, ctxFor(activities)),
    ).rejects.toThrow();

    const statuses = activities.updateEmbeddingStatus.mock.calls.map(
      ([arg]) => (arg as { status: string }).status,
    );
    // A file whose access could not be confirmed must not read as indexed:
    // stale-and-broader is the failure here, and a retry costs only time.
    expect(statuses).not.toContain(EmbeddingStatus.COMPLETED);
    expect(statuses).toContain(EmbeddingStatus.FAILED);
  });
});

describe('reindexDocumentVersion', () => {
  it('re-reads the principals after writing, before COMPLETED', async () => {
    const activities = createMockActivities();

    await reindexDocumentVersion(
      {
        orgId: 'org-1',
        fileId: 'file-1',
        fileName: 'umowa.md',
        projectId: 'proj-1',
        userId: 'user-1',
        documentId: 'doc-1',
      },
      ctxFor(activities),
    );

    expectCheckedAfterTheWrite(activities, {
      orgId: 'org-1',
      fileId: 'file-1',
    });
  });
});

describe('scrapeWebsite', () => {
  it('re-reads the principals after writing, before COMPLETED', async () => {
    const activities = createMockActivities();

    await scrapeWebsite(
      {
        url: 'https://example.com',
        mode: WebsiteLoaderMode.SCRAPE,
        orgId: 'org-1',
        projectId: 'proj-1',
      },
      ctxFor(activities),
    );

    // The scrape creates its own row; the file id is whatever it made.
    const [{ orgId, fileId }] = activities.syncFileAccess.mock.calls[0] as [
      { orgId: string; fileId: string },
    ];
    expectCheckedAfterTheWrite(activities, { orgId, fileId });
  });
});
