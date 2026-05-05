import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockCreateVersion = vi.fn();
const mockUpdateDocument = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentVersion: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    userDocument: {
      updateMany: (...args: unknown[]) => mockUpdateDocument(...args),
    },
  },
}));

vi.mock('../create-document-version-command', () => ({
  createDocumentVersionCommand: (...args: unknown[]) =>
    mockCreateVersion(...args),
}));

import { rollbackDocumentVersionCommand } from '../rollback-document-version-command';

describe('rollbackDocumentVersionCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates new version with content from target version and changeType ROLLBACK', async () => {
    const targetVersion = {
      id: 'ver-2',
      documentId: 'doc-1',
      content: 'Old content',
      title: 'Old title',
      metadata: null,
      ragScore: null,
    };
    mockFindFirst.mockResolvedValueOnce(targetVersion);
    mockCreateVersion.mockResolvedValueOnce({
      id: 'ver-new',
      versionNumber: 5,
    });
    mockUpdateDocument.mockResolvedValueOnce({ count: 1 });

    const result = await rollbackDocumentVersionCommand({
      documentId: 'doc-1',
      versionId: 'ver-2',
      authorId: 'user-1',
      orgId: 'org-1',
    });

    expect(mockCreateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        content: 'Old content',
        title: 'Old title',
        changeType: 'ROLLBACK',
        authorId: 'user-1',
        comment: 'Rollback to version ver-2',
      }),
    );
    expect(result.versionNumber).toBe(5);
  });

  it('throws when target version not found', async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      rollbackDocumentVersionCommand({
        documentId: 'doc-1',
        versionId: 'ver-999',
        authorId: 'user-1',
        orgId: 'org-1',
      }),
    ).rejects.toThrow('Version not found');
  });
});
