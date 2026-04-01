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

    const result = await moveFolderCommand(1, 2, ORG_ID);

    expect(result).toEqual({ success: false, error: 'Folder not found' });
  });

  it('prevents moving folder into itself', async () => {
    mockFindFirst.mockResolvedValue({
      id: 5,
      path: '/',
      organizationId: ORG_ID,
    });

    const result = await moveFolderCommand(5, 5, ORG_ID);

    expect(result).toEqual({
      success: false,
      error: 'Cannot move a folder into itself',
    });
  });

  it('prevents circular moves (moving into own descendant)', async () => {
    // Folder 1 at root, trying to move into folder 3 which is at /1/2/
    mockFindFirst
      .mockResolvedValueOnce({
        id: 1,
        path: '/',
        organizationId: ORG_ID,
      })
      .mockResolvedValueOnce({
        id: 3,
        path: '/1/2/',
        organizationId: ORG_ID,
      });

    const result = await moveFolderCommand(1, 3, ORG_ID);

    expect(result).toEqual({
      success: false,
      error: 'Cannot move a folder into its own subfolder',
    });
  });

  it('moves folder to root (null parent)', async () => {
    mockFindFirst.mockResolvedValue({
      id: 5,
      path: '/3/',
      organizationId: ORG_ID,
    });
    mockFindMany.mockResolvedValue([]);

    const result = await moveFolderCommand(5, null, ORG_ID);

    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: { parentId: null, path: '/' },
      }),
    );
  });

  it('updates descendant paths when moving', async () => {
    // Folder 5 at /3/, has descendant 8 at /3/5/
    mockFindFirst
      .mockResolvedValueOnce({
        id: 5,
        path: '/3/',
        organizationId: ORG_ID,
      })
      .mockResolvedValueOnce({
        id: 10,
        path: '/',
        organizationId: ORG_ID,
      });

    mockFindMany.mockResolvedValue([{ id: 8, path: '/3/5/' }]);

    const result = await moveFolderCommand(5, 10, ORG_ID);

    expect(result).toEqual({ success: true });
    // Folder 5 should be updated to path /10/
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: { parentId: 10, path: '/10/' },
      }),
    );
    // Descendant 8 should have path updated from /3/5/ to /10/5/
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8 },
        data: { path: '/10/5/' },
      }),
    );
  });
});
