import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFolderFindFirst = vi.fn();
const mockFolderFindMany = vi.fn();
const mockFolderDeleteMany = vi.fn();
const mockFolderDelete = vi.fn();
const mockFileFindMany = vi.fn();
const mockFileDeleteMany = vi.fn();
const mockDocumentFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentFolder: {
      findFirst: (...args: unknown[]) => mockFolderFindFirst(...args),
      findMany: (...args: unknown[]) => mockFolderFindMany(...args),
      deleteMany: (...args: unknown[]) => mockFolderDeleteMany(...args),
      delete: (...args: unknown[]) => mockFolderDelete(...args),
    },
    userFile: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
      deleteMany: (...args: unknown[]) => mockFileDeleteMany(...args),
    },
    userDocument: {
      findFirst: (...args: unknown[]) => mockDocumentFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockDeleteFromS3 = vi.fn();
const mockDeleteFromS3ByKey = vi.fn();
vi.mock('@/app/lib/services/storage', () => ({
  deleteFromS3: (...args: unknown[]) => mockDeleteFromS3(...args),
  deleteFromS3ByKey: (...args: unknown[]) => mockDeleteFromS3ByKey(...args),
}));

const mockDeleteFileFromVectorStore = vi.fn();
vi.mock('@/app/api/upload/services/TableService', () => ({
  deleteFileFromVectorStore: (...args: unknown[]) =>
    mockDeleteFileFromVectorStore(...args),
}));

const mockDeleteDocumentFromDb = vi.fn();
vi.mock(
  '@/features/documents/services/commands/update-document-command',
  () => ({
    deleteDocumentFromDbCommand: (...args: unknown[]) =>
      mockDeleteDocumentFromDb(...args),
  }),
);

const mockGetOrganizationFilesCount = vi.fn();
vi.mock('@/features/documents/services/queries/get-file-details-query', () => ({
  getOrganizationFilesCountQuery: (...args: unknown[]) =>
    mockGetOrganizationFilesCount(...args),
}));

const mockSaveOrgMetadata = vi.fn();
vi.mock(
  '@/features/organizations/services/commands/save-organization-metadata-command',
  () => ({
    saveOrganizationPublicMetadataCommand: (...args: unknown[]) =>
      mockSaveOrgMetadata(...args),
  }),
);

vi.mock('@/app/lib/utils/getFileExtension', () => ({
  getFileExtension: (name: string) => name.split('.').pop(),
}));

vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({
    trackAudit: vi.fn(),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { deleteFolderCommand } from '../delete-folder-command';

// The write-restriction gates resolve flags from the database. These files
// test what happens *after* the gate allows the operation; the gate's own
// behaviour is covered in feature-guards.test.ts and in the per-command
// refusal cases.
vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageDocuments: vi.fn(),
  assertCanManageProjects: vi.fn(),
  assertCanManageOrganizationSettings: vi.fn(),
}));

const ORG_ID = 'org-1';

describe('deleteFolderCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        userFile: {
          deleteMany: mockFileDeleteMany,
        },
        documentFolder: {
          deleteMany: mockFolderDeleteMany,
          delete: mockFolderDelete,
        },
      };
      return fn(tx);
    });
    mockGetOrganizationFilesCount.mockResolvedValue(10);
  });

  it('returns error if folder not found', async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    const result = await deleteFolderCommand('folder-1', ORG_ID);

    expect(result).toEqual({ success: false, error: 'Folder not found' });
  });

  it('deletes an empty folder without file cleanup', async () => {
    mockFolderFindFirst.mockResolvedValue({
      id: 'folder-1',
      path: '/',
      organizationId: ORG_ID,
    });
    mockFolderFindMany.mockResolvedValue([]);
    mockFileFindMany.mockResolvedValue([]);

    const result = await deleteFolderCommand('folder-1', ORG_ID);

    expect(result).toEqual({ success: true });
    expect(mockDeleteFromS3).not.toHaveBeenCalled();
    expect(mockDeleteFileFromVectorStore).not.toHaveBeenCalled();
    expect(mockFolderDelete).toHaveBeenCalledWith({
      where: { id: 'folder-1' },
    });
  });

  it('deletes files from S3 and vector store when folder has files', async () => {
    mockFolderFindFirst.mockResolvedValue({
      id: 'folder-1',
      path: '/',
      organizationId: ORG_ID,
    });
    mockFolderFindMany.mockResolvedValue([]);
    mockFileFindMany.mockResolvedValue([
      {
        id: 'file-abc',
        fileName: 'report.pdf',
        documentId: 'doc-1',
        thumbnailS3Key: 'thumb/file-abc.jpg',
      },
    ]);
    mockDocumentFindFirst.mockResolvedValue({ id: 'doc-200' });

    const result = await deleteFolderCommand('folder-1', ORG_ID);

    expect(result).toEqual({ success: true });
    expect(mockDeleteFromS3).toHaveBeenCalledWith('file-abc.pdf');
    expect(mockDeleteFromS3ByKey).toHaveBeenCalledWith('thumb/file-abc.jpg');
    // The org id is passed, not re-derived from a session — see
    // delete-file-command.test.ts for why that distinction is the whole fix.
    expect(mockDeleteFileFromVectorStore).toHaveBeenCalledWith(
      'file-abc',
      ORG_ID,
    );
    // Looked up and deleted by the validated org id, never through the
    // session: `getDocumentByIdQuery` applies the caller's read permission, so
    // a folder holding a file this user cannot read would have orphaned its
    // UserDocument row.
    expect(mockDocumentFindFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', organizationId: ORG_ID },
      select: { id: true },
    });
    expect(mockDeleteDocumentFromDb).toHaveBeenCalledWith('doc-200', ORG_ID);
    expect(mockFileDeleteMany).toHaveBeenCalled();
    expect(mockFolderDelete).toHaveBeenCalledWith({
      where: { id: 'folder-1' },
    });
  });

  it('deletes files from descendant folders', async () => {
    mockFolderFindFirst.mockResolvedValue({
      id: 'folder-1',
      path: '/',
      organizationId: ORG_ID,
    });
    mockFolderFindMany.mockResolvedValue([
      { id: 'folder-2' },
      { id: 'folder-3' },
    ]);
    mockFileFindMany.mockResolvedValue([
      {
        id: 'file-1',
        fileName: 'a.txt',
        documentId: null,
        thumbnailS3Key: null,
      },
      {
        id: 'file-2',
        fileName: 'b.md',
        documentId: null,
        thumbnailS3Key: null,
      },
    ]);

    const result = await deleteFolderCommand('folder-1', ORG_ID);

    expect(result).toEqual({ success: true });
    expect(mockDeleteFromS3).toHaveBeenCalledTimes(2);
    expect(mockDeleteFileFromVectorStore).toHaveBeenCalledTimes(2);
    // Descendant folders should be deleted
    expect(mockFolderDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['folder-2', 'folder-3'] } },
    });
  });

  it('updates org metadata when no files remain', async () => {
    mockFolderFindFirst.mockResolvedValue({
      id: 'folder-1',
      path: '/',
      organizationId: ORG_ID,
    });
    mockFolderFindMany.mockResolvedValue([]);
    mockFileFindMany.mockResolvedValue([
      {
        id: 'file-last',
        fileName: 'last.pdf',
        documentId: null,
        thumbnailS3Key: null,
      },
    ]);
    mockGetOrganizationFilesCount.mockResolvedValue(0);

    await deleteFolderCommand('folder-1', ORG_ID);

    expect(mockSaveOrgMetadata).toHaveBeenCalledWith(ORG_ID, {
      hasKnowledge: false,
    });
  });

  it('continues deleting other files if one S3 deletion fails', async () => {
    mockFolderFindFirst.mockResolvedValue({
      id: 'folder-1',
      path: '/',
      organizationId: ORG_ID,
    });
    mockFolderFindMany.mockResolvedValue([]);
    mockFileFindMany.mockResolvedValue([
      {
        id: 'file-fail',
        fileName: 'a.txt',
        documentId: null,
        thumbnailS3Key: null,
      },
      {
        id: 'file-ok',
        fileName: 'b.txt',
        documentId: null,
        thumbnailS3Key: null,
      },
    ]);
    mockDeleteFromS3
      .mockRejectedValueOnce(new Error('S3 error'))
      .mockResolvedValueOnce(undefined);

    const result = await deleteFolderCommand('folder-1', ORG_ID);

    expect(result).toEqual({ success: true });
    expect(mockDeleteFromS3).toHaveBeenCalledTimes(2);
    expect(mockDeleteFileFromVectorStore).toHaveBeenCalledTimes(2);
  });
});
