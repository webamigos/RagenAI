import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendNotification = vi.fn().mockResolvedValue(undefined);
const mockListFiles = vi.fn();
const mockGetContent = vi.fn();
const mockUserFileFindFirst = vi.fn();

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageDocuments: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/features/notifications/utils/send-notification-to-user', () => ({
  sendNotificationToUser: (...args: unknown[]) => mockSendNotification(...args),
}));
vi.mock('../../queries/list-drive-folder-files-query', () => ({
  listDriveFolderFilesQuery: (...args: unknown[]) => mockListFiles(...args),
}));
vi.mock('../../queries/get-drive-file-content-query', () => ({
  getDriveFileContentQuery: (...args: unknown[]) => mockGetContent(...args),
}));
vi.mock('@/app/lib/services/storage', () => ({
  uploadToS3WithOrg: vi.fn(),
}));
vi.mock('@/libs/jobs', () => ({ jobs: () => ({ start: vi.fn() }) }));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'proj-1' }) },
    organization: {
      findUnique: vi.fn().mockResolvedValue({ id: 'org-1', slug: 'acme' }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ email: 'a@b.c' }) },
    userFile: {
      findFirst: (...args: unknown[]) => mockUserFileFindFirst(...args),
    },
    googleDriveSync: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));

import { importDriveFolderCommand } from '../import-drive-folder-command';

const file = (id: string) => ({
  id,
  name: `${id}.txt`,
  mime_type: 'text/plain',
  modified_time: '2026-09-01T00:00:00Z',
});

describe('importDriveFolderCommand — the completion notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the folder and the counts as details, with an English fallback', async () => {
    mockListFiles.mockResolvedValue({
      success: true,
      files: [file('a'), file('b'), file('c')],
    });
    // Two already imported, one whose content cannot be read.
    mockUserFileFindFirst
      .mockResolvedValueOnce({ id: 'existing-a' })
      .mockResolvedValueOnce({ id: 'existing-b' })
      .mockResolvedValueOnce(null);
    mockGetContent.mockResolvedValue({ success: false, error: 'nope' });

    const result = await importDriveFolderCommand(
      'org-1',
      'user-1',
      'drive-folder-1',
      'Specs',
      'proj-1',
    );

    expect(result).toMatchObject({
      success: true,
      importedCount: 0,
      skippedCount: 2,
      failedCount: 1,
    });
    expect(mockSendNotification).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      'DRIVE_IMPORT_COMPLETED',
      {
        title: 'Google Drive import finished',
        body: 'Imported 0 files from "Specs"',
        resourceUrl: '/knowledge/documents-list',
        metadata: {
          folderName: 'Specs',
          importedCount: 0,
          skippedCount: 2,
          failedCount: 1,
        },
      },
    );
  });
});
