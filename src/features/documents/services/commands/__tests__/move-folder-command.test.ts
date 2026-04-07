import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentFolder: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(fn),
  },
}));

import { moveFolderCommand } from '../move-folder-command';

const ORG_ID = 'org-1';

describe('moveFolderCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          documentFolder: {
            findMany: mockFindMany,
            update: mockUpdate,
          },
        };
        return fn(tx);
      },
    );
  });

  it('returns error when folder not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await moveFolderCommand('folder-1', 'folder-2', ORG_ID);

    expect(result).toEqual({ success: false, error: 'Folder not found' });
  });

  it('prevents moving folder into itself', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'folder-5',
      path: '/',
      organizationId: ORG_ID,
    });

    const result = await moveFolderCommand('folder-5', 'folder-5', ORG_ID);

    expect(result).toEqual({
      success: false,
      error: 'Cannot move a folder into itself',
    });
  });

  it('prevents circular moves (moving into own descendant)', async () => {
    // Folder 1 at root, trying to move into folder 3 which is at /folder-1/folder-2/
    mockFindFirst
      .mockResolvedValueOnce({
        id: 'folder-1',
        path: '/',
        organizationId: ORG_ID,
      })
      .mockResolvedValueOnce({
        id: 'folder-3',
        path: '/folder-1/folder-2/',
        organizationId: ORG_ID,
      });

    const result = await moveFolderCommand('folder-1', 'folder-3', ORG_ID);

    expect(result).toEqual({
      success: false,
      error: 'Cannot move a folder into its own subfolder',
    });
  });

  it('moves folder to root (null parent)', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'folder-5',
      path: '/folder-3/',
      organizationId: ORG_ID,
    });
    mockFindMany.mockResolvedValue([]);

    const result = await moveFolderCommand('folder-5', null, ORG_ID);

    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'folder-5' },
        data: { parentId: null, path: '/' },
      }),
    );
  });

  it('updates descendant paths when moving', async () => {
    // Folder 5 at /folder-3/, has descendant 8 at /folder-3/folder-5/
    mockFindFirst
      .mockResolvedValueOnce({
        id: 'folder-5',
        path: '/folder-3/',
        organizationId: ORG_ID,
      })
      .mockResolvedValueOnce({
        id: 'folder-10',
        path: '/',
        organizationId: ORG_ID,
      });

    mockFindMany.mockResolvedValue([
      { id: 'folder-8', path: '/folder-3/folder-5/' },
    ]);

    const result = await moveFolderCommand('folder-5', 'folder-10', ORG_ID);

    expect(result).toEqual({ success: true });
    // Folder 5 should be updated to path /folder-10/
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'folder-5' },
        data: { parentId: 'folder-10', path: '/folder-10/' },
      }),
    );
    // Descendant 8 should have path updated from /folder-3/folder-5/ to /folder-10/folder-5/
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'folder-8' },
        data: { path: '/folder-10/folder-5/' },
      }),
    );
  });
});
