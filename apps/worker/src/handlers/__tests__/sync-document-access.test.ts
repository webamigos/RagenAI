import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import { createMockActivities } from '../../__tests__/fixtures/mock-activities.js';
import { syncDocumentAccess } from '../sync-document-access.js';

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

describe('syncDocumentAccess', () => {
  it('syncs every file the resolution returns, by id and organization only', async () => {
    const activities = createMockActivities();
    activities.resolveAccessSyncFiles.mockResolvedValue(['f1', 'f2', 'f3']);
    activities.syncFileAccess.mockResolvedValue('synced');

    const result = await syncDocumentAccess(
      { orgId: 'org-1', folderIds: ['folder-1'], fileIds: ['f1'] },
      context(activities),
    );

    expect(activities.resolveAccessSyncFiles).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileIds: ['f1'],
      folderIds: ['folder-1'],
    });
    // No principals in the call: the activity reads them when it runs.
    expect(activities.syncFileAccess.mock.calls).toEqual([
      [{ orgId: 'org-1', fileId: 'f1' }],
      [{ orgId: 'org-1', fileId: 'f2' }],
      [{ orgId: 'org-1', fileId: 'f3' }],
    ]);
    expect(result).toEqual({ filesSynced: 3, filesMissing: 0 });
  });

  it('counts a file that is gone, and does not fail for it', async () => {
    const activities = createMockActivities();
    activities.resolveAccessSyncFiles.mockResolvedValue(['f1', 'gone']);
    activities.syncFileAccess.mockImplementation(
      async ({ fileId }: { fileId: string }) =>
        fileId === 'gone' ? 'missing' : 'synced',
    );

    const result = await syncDocumentAccess(
      { orgId: 'org-1', fileIds: ['f1', 'gone'] },
      context(activities),
    );

    expect(result).toEqual({ filesSynced: 1, filesMissing: 1 });
  });

  it('tries every file before failing, so one bad file does not hide the rest', async () => {
    const activities = createMockActivities();
    activities.resolveAccessSyncFiles.mockResolvedValue(['f1', 'bad', 'f3']);
    activities.syncFileAccess.mockImplementation(
      async ({ fileId }: { fileId: string }) => {
        if (fileId === 'bad') {
          throw new Error('qdrant unavailable');
        }
        return 'synced';
      },
    );

    await expect(
      syncDocumentAccess(
        { orgId: 'org-1', fileIds: ['x'] },
        context(activities),
      ),
    ).rejects.toThrow(/1 of 3 files/);

    // The file after the failing one was still attempted.
    expect(activities.syncFileAccess).toHaveBeenCalledTimes(3);
  });

  it('refuses a payload that names nothing, without retrying', async () => {
    const activities = createMockActivities();

    const error = await syncDocumentAccess(
      { orgId: 'org-1' },
      context(activities),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: 'JobFailure', retryable: false });
    expect(activities.resolveAccessSyncFiles).not.toHaveBeenCalled();
  });

  it('does not log the vector store error, which can echo a request', async () => {
    const activities = createMockActivities();
    activities.resolveAccessSyncFiles.mockResolvedValue(['bad']);
    activities.syncFileAccess.mockRejectedValue(
      Object.assign(new Error('filter: user:alice@example.com'), {
        name: 'ApiError',
      }),
    );
    const ctx = context(activities);

    await syncDocumentAccess({ orgId: 'org-1', fileIds: ['bad'] }, ctx).catch(
      () => undefined,
    );

    expect(JSON.stringify((ctx.log.error as any).mock.calls)).not.toContain(
      'alice@example.com',
    );
  });
});
