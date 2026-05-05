import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentVersion: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { createDocumentVersionCommand } from '../create-document-version-command';

describe('createDocumentVersionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates version with versionNumber = lastVersion + 1', async () => {
    mockFindFirst.mockResolvedValueOnce({ versionNumber: 3 });
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });
      mockCreate.mockResolvedValueOnce({
        id: 'ver-4',
        versionNumber: 4,
        isActive: true,
      });
      return fn({
        documentVersion: {
          updateMany: mockUpdateMany,
          create: mockCreate,
        },
      });
    });

    const result = await createDocumentVersionCommand({
      documentId: 'doc-1',
      content: 'New content',
      title: 'Title',
      changeType: 'MANUAL',
      authorId: 'user-1',
    });

    expect(result.versionNumber).toBe(4);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId: 'doc-1', isActive: true },
      }),
    );
  });

  it('starts at version 1 when no previous versions', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockCreate.mockResolvedValueOnce({
        id: 'ver-1',
        versionNumber: 1,
        isActive: true,
      });
      return fn({
        documentVersion: { updateMany: mockUpdateMany, create: mockCreate },
      });
    });

    const result = await createDocumentVersionCommand({
      documentId: 'doc-1',
      content: 'content',
      title: 'Title',
      changeType: 'UPLOAD',
      authorId: null,
    });

    expect(result.versionNumber).toBe(1);
  });
});
