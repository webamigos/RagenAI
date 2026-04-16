import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks (must be declared before any imports of the tested module) ---

const mockGetOrgIdFromAuthOrThrow = vi.fn();
const mockGetCurrentUserId = vi.fn();
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => mockGetOrgIdFromAuthOrThrow(),
  getCurrentUserId: () => mockGetCurrentUserId(),
}));

const mockGetActiveMember = vi.fn();
vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: (...args: unknown[]) => mockGetActiveMember(...args),
}));

vi.mock('@/lib/auth-access-control', () => ({
  isOrgAdmin: (role: string) => role === 'admin' || role === 'owner',
}));

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      updateMany: vi.fn(),
    },
  },
}));

const mockDeleteFileCommand = vi.fn();
vi.mock('@/features/documents/services/commands/delete-file-command', () => ({
  deleteFileCommand: (...args: unknown[]) => mockDeleteFileCommand(...args),
}));

const mockMoveFileToFolderCommand = vi.fn();
vi.mock(
  '@/features/documents/services/commands/move-file-to-folder-command',
  () => ({
    moveFileToFolderCommand: (...args: unknown[]) =>
      mockMoveFileToFolderCommand(...args),
  }),
);

const mockShareResourceCommand = vi.fn();
vi.mock(
  '@/features/documents/services/commands/share-resource-command',
  () => ({
    shareResourceCommand: (...args: unknown[]) =>
      mockShareResourceCommand(...args),
  }),
);

const mockGetTemporalClient = vi.fn();
vi.mock('@/libs/temporal', () => ({
  getTemporalClient: () => mockGetTemporalClient(),
  TASK_QUEUE_NAME: 'test-queue',
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// --- import after mocks ---
import {
  bulkDeleteFilesAction,
  bulkMoveFilesToFolderAction,
  bulkShareFilesAction,
  bulkReembedFilesAction,
} from '../bulk-documents';

describe('bulkDeleteFilesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
    mockGetActiveMember.mockResolvedValue({ role: 'member' });
  });

  it('deletes owned files successfully', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      ownerId: 'user-1',
      fileName: 'doc.pdf',
    });
    mockDeleteFileCommand.mockResolvedValue({
      deleted: true,
      fileId: 'file-1',
      fileName: 'doc.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-1']);

    expect(result.succeeded).toEqual(['file-1']);
    expect(result.failed).toHaveLength(0);
  });

  it('adds insufficient_permissions to failed when user is not owner and not admin', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-2',
      ownerId: 'other-user',
      fileName: 'secret.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-2']);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toEqual([
      {
        fileId: 'file-2',
        fileName: 'secret.pdf',
        error: 'insufficient_permissions',
      },
    ]);
    expect(mockDeleteFileCommand).not.toHaveBeenCalled();
  });

  it('org admin can delete any file', async () => {
    mockGetActiveMember.mockResolvedValue({ role: 'admin' });
    mockFindFirst.mockResolvedValue({
      id: 'file-3',
      ownerId: 'other-user',
      fileName: 'any.pdf',
    });
    mockDeleteFileCommand.mockResolvedValue({
      deleted: true,
      fileId: 'file-3',
      fileName: 'any.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-3']);

    expect(result.succeeded).toEqual(['file-3']);
  });

  it('partial success: one file succeeds, one missing returns not-found error', async () => {
    mockFindFirst
      .mockResolvedValueOnce({
        id: 'file-1',
        ownerId: 'user-1',
        fileName: 'a.pdf',
      })
      .mockResolvedValueOnce(null);
    mockDeleteFileCommand.mockResolvedValue({
      deleted: true,
      fileId: 'file-1',
      fileName: 'a.pdf',
    });

    const result = await bulkDeleteFilesAction(['file-1', 'file-missing']);

    expect(result.succeeded).toEqual(['file-1']);
    expect(result.failed).toEqual([
      { fileId: 'file-missing', fileName: 'file-missing', error: 'not_found' },
    ]);
  });
});

describe('bulkMoveFilesToFolderAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
  });

  it('moves files to folder successfully', async () => {
    mockMoveFileToFolderCommand.mockResolvedValue({ success: true });

    const result = await bulkMoveFilesToFolderAction(
      ['file-1', 'file-2'],
      'folder-1',
    );

    expect(result.succeeded).toEqual(['file-1', 'file-2']);
    expect(result.failed).toHaveLength(0);
    expect(mockMoveFileToFolderCommand).toHaveBeenCalledTimes(2);
  });

  it('collects error when moveFileToFolderCommand fails', async () => {
    mockMoveFileToFolderCommand.mockResolvedValue({
      success: false,
      error: 'Folder not found',
    });

    const result = await bulkMoveFilesToFolderAction(
      ['file-bad'],
      'folder-nonexistent',
    );

    expect(result.failed).toEqual([
      { fileId: 'file-bad', fileName: 'file-bad', error: 'Folder not found' },
    ]);
  });
});

describe('bulkShareFilesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
  });

  it('shares files successfully', async () => {
    mockShareResourceCommand.mockResolvedValue({ success: true });

    const result = await bulkShareFilesAction(
      ['file-1'],
      'user',
      'grantee-1',
      'view',
    );

    expect(result.succeeded).toEqual(['file-1']);
    expect(mockShareResourceCommand).toHaveBeenCalledWith({
      resourceType: 'file',
      fileId: 'file-1',
      organizationId: 'org-1',
      granteeType: 'user',
      granteeId: 'grantee-1',
      permission: 'view',
      grantedBy: 'user-1',
    });
  });
});

describe('bulkReembedFilesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgIdFromAuthOrThrow.mockResolvedValue('org-1');
    mockGetCurrentUserId.mockResolvedValue('user-1');
    const mockWorkflowStart = vi.fn().mockResolvedValue(undefined);
    mockGetTemporalClient.mockReturnValue({
      workflow: { start: mockWorkflowStart },
    });
  });

  it('re-embeds files and starts workflows', async () => {
    const db = (await import('@ragenai/prisma-client')).default;
    const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const mockFindMany = vi
      .fn()
      .mockResolvedValue([
        {
          id: 'file-1',
          fileName: 'doc.pdf',
          organizationId: 'org-1',
          projectId: null,
        },
      ]);
    (db.userFile as unknown as Record<string, unknown>).updateMany =
      mockUpdateMany;
    (db.userFile as unknown as Record<string, unknown>).findMany = mockFindMany;

    const result = await bulkReembedFilesAction(['file-1']);

    expect(result.succeeded).toEqual(['file-1']);
    expect(mockUpdateMany).toHaveBeenCalled();
  });
});
