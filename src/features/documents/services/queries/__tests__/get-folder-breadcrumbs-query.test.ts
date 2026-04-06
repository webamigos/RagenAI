import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentFolder: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { getFolderBreadcrumbsQuery } from '../get-folder-breadcrumbs-query';

const ORG_ID = 'org-1';

describe('getFolderBreadcrumbsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when folder not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getFolderBreadcrumbsQuery('folder-999', ORG_ID);
    expect(result).toEqual([]);
  });

  it('returns single item for root folder', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'folder-1',
      name: 'Root Folder',
      path: '/',
    });

    const result = await getFolderBreadcrumbsQuery('folder-1', ORG_ID);
    expect(result).toEqual([{ id: 'folder-1', name: 'Root Folder' }]);
  });

  it('returns ancestor chain for nested folder', async () => {
    // Folder 3 is at path /folder-1/folder-2/ — ancestors are folder-1 and folder-2
    mockFindFirst.mockResolvedValue({
      id: 'folder-3',
      name: 'Deep Folder',
      path: '/folder-1/folder-2/',
    });
    mockFindMany.mockResolvedValue([
      { id: 'folder-1', name: 'Root' },
      { id: 'folder-2', name: 'Middle' },
    ]);

    const result = await getFolderBreadcrumbsQuery('folder-3', ORG_ID);
    expect(result).toEqual([
      { id: 'folder-1', name: 'Root' },
      { id: 'folder-2', name: 'Middle' },
      { id: 'folder-3', name: 'Deep Folder' },
    ]);
  });

  it('maintains correct order from path', async () => {
    // Path /folder-5/folder-1/ means folder-5 is the root ancestor, then folder-1
    mockFindFirst.mockResolvedValue({
      id: 'folder-10',
      name: 'Leaf',
      path: '/folder-5/folder-1/',
    });
    mockFindMany.mockResolvedValue([
      { id: 'folder-1', name: 'Second' },
      { id: 'folder-5', name: 'First' },
    ]);

    const result = await getFolderBreadcrumbsQuery('folder-10', ORG_ID);
    // Should be sorted by path order: folder-5, folder-1, then current (folder-10)
    expect(result[0].id).toBe('folder-5');
    expect(result[1].id).toBe('folder-1');
    expect(result[2].id).toBe('folder-10');
  });
});
