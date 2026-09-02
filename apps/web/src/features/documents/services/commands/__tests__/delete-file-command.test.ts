import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockDeleteMany = vi.fn();
const mockDocumentFindFirst = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    userDocument: {
      findFirst: (...args: unknown[]) => mockDocumentFindFirst(...args),
    },
  },
}));

const mockDeleteFromS3 = vi.fn();
const mockDeleteFromS3ByKey = vi.fn();
vi.mock('@/app/lib/services/storage', () => ({
  deleteFromS3: (...args: unknown[]) => mockDeleteFromS3(...args),
  deleteFromS3ByKey: (...args: unknown[]) => mockDeleteFromS3ByKey(...args),
}));

const mockDeleteFromVectorStore = vi.fn();
vi.mock('@/app/api/upload/services/TableService', () => ({
  deleteFileFromVectorStore: (...args: unknown[]) =>
    mockDeleteFromVectorStore(...args),
}));

const mockDeleteDocumentFromDb = vi.fn();
vi.mock(
  '@/features/documents/services/commands/update-document-command',
  () => ({
    deleteDocumentFromDbCommand: (...args: unknown[]) =>
      mockDeleteDocumentFromDb(...args),
  }),
);

const mockTrackAudit = vi.fn();
vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => ({
    trackAudit: (...args: unknown[]) => mockTrackAudit(...args),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { deleteFileCommand } from '../delete-file-command';

describe('deleteFileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteFromS3.mockResolvedValue(undefined);
    mockDeleteFromS3ByKey.mockResolvedValue(undefined);
    mockDeleteFromVectorStore.mockResolvedValue(undefined);
    mockDocumentFindFirst.mockResolvedValue(null);
    mockDeleteDocumentFromDb.mockResolvedValue(undefined);
  });

  it('returns deleted:false when the file does not exist', async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await deleteFileCommand({
      fileId: 'missing',
      organizationId: 'org-1',
    });
    expect(result).toEqual({
      deleted: false,
      fileId: 'missing',
      fileName: null,
    });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('scopes lookup by projectId when provided', async () => {
    mockFindFirst.mockResolvedValue(null);
    await deleteFileCommand({
      fileId: 'f1',
      organizationId: 'org-1',
      projectId: 'proj-1',
    });
    const whereArg = mockFindFirst.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({
      id: 'f1',
      organizationId: 'org-1',
      projectId: 'proj-1',
    });
  });

  it('deletes DB + S3 + vectors + thumbnail when present', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-1',
      organizationId: 'org-1',
      fileName: 'doc.pdf',
      thumbnailS3Key: 'org-1/thumbs/doc.pdf',
      documentId: null,
    });
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteFileCommand({
      fileId: 'file-1',
      organizationId: 'org-1',
    });

    expect(result).toEqual({
      deleted: true,
      fileId: 'file-1',
      fileName: 'doc.pdf',
    });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
    });
    expect(mockDeleteFromS3).toHaveBeenCalledWith('file-1.pdf');
    expect(mockDeleteFromS3ByKey).toHaveBeenCalledWith('org-1/thumbs/doc.pdf');
    expect(mockDeleteFromVectorStore).toHaveBeenCalledWith('file-1');
    expect(mockTrackAudit).toHaveBeenCalled();
  });

  it('keeps going when external cleanup fails (S3, vectors)', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-2',
      organizationId: 'org-1',
      fileName: 'notes.txt',
      thumbnailS3Key: null,
      documentId: null,
    });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockDeleteFromS3.mockRejectedValue(new Error('S3 down'));
    mockDeleteFromVectorStore.mockRejectedValue(new Error('qdrant down'));

    const result = await deleteFileCommand({
      fileId: 'file-2',
      organizationId: 'org-1',
    });

    expect(result.deleted).toBe(true);
  });

  it('deletes the linked UserDocument when present', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-3',
      organizationId: 'org-1',
      fileName: 'spec.md',
      thumbnailS3Key: null,
      documentId: 'doc-9',
    });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockDocumentFindFirst.mockResolvedValue({ id: 'doc-9' });

    await deleteFileCommand({ fileId: 'file-3', organizationId: 'org-1' });

    expect(mockDeleteDocumentFromDb).toHaveBeenCalledWith('doc-9', 'org-1');
  });

  it('looks the linked UserDocument up by org, not through the session', async () => {
    // Regression guard, and it covers both halves. The lookup used to go
    // through `getDocumentByIdQuery` and the delete used to read the session
    // for its org id. The sessionless callers of this command — the internal
    // `/api/v1/files/[fileId]` route runs on a shared secret — would have hit
    // the `catch`, logged a warning, and orphaned the row.
    mockFindFirst.mockResolvedValue({
      id: 'file-5',
      organizationId: 'org-1',
      fileName: 'notes.md',
      thumbnailS3Key: null,
      documentId: 'doc-11',
    });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockDocumentFindFirst.mockResolvedValue({ id: 'doc-11' });

    await deleteFileCommand({ fileId: 'file-5', organizationId: 'org-1' });

    expect(mockDocumentFindFirst).toHaveBeenCalledWith({
      where: { id: 'doc-11', organizationId: 'org-1' },
      select: { id: true },
    });
    // The org id is passed explicitly, so nothing here touches the session.
    expect(mockDeleteDocumentFromDb).toHaveBeenCalledWith('doc-11', 'org-1');
  });

  it('returns deleted:false if deleteMany reports 0 rows (race)', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'file-4',
      organizationId: 'org-1',
      fileName: 'x.pdf',
      thumbnailS3Key: null,
      documentId: null,
    });
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteFileCommand({
      fileId: 'file-4',
      organizationId: 'org-1',
    });

    expect(result.deleted).toBe(false);
    expect(mockDeleteFromS3).not.toHaveBeenCalled();
  });
});
