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

    const result = await getFolderBreadcrumbsQuery(999, ORG_ID);
    expect(result).toEqual([]);
  });

  it('returns single item for root folder', async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      publicId: 'pub-1',
      name: 'Root Folder',
      path: '/',
    });

    const result = await getFolderBreadcrumbsQuery(1, ORG_ID);
    expect(result).toEqual([{ id: 1, publicId: 'pub-1', name: 'Root Folder' }]);
  });

  it('returns ancestor chain for nested folder', async () => {
    // Folder 3 is at path /1/2/ — ancestors are 1 and 2
    mockFindFirst.mockResolvedValue({
      id: 3,
      publicId: 'pub-3',
      name: 'Deep Folder',
      path: '/1/2/',
    });
    mockFindMany.mockResolvedValue([
      { id: 1, publicId: 'pub-1', name: 'Root' },
      { id: 2, publicId: 'pub-2', name: 'Middle' },
    ]);

    const result = await getFolderBreadcrumbsQuery(3, ORG_ID);
    expect(result).toEqual([
      { id: 1, publicId: 'pub-1', name: 'Root' },
      { id: 2, publicId: 'pub-2', name: 'Middle' },
      { id: 3, publicId: 'pub-3', name: 'Deep Folder' },
    ]);
  });

  it('maintains correct order from path', async () => {
    // Path /5/1/ means folder 5 is the root ancestor, then 1
    mockFindFirst.mockResolvedValue({
      id: 10,
      publicId: 'pub-10',
      name: 'Leaf',
      path: '/5/1/',
    });
    mockFindMany.mockResolvedValue([
      { id: 1, publicId: 'pub-1', name: 'Second' },
      { id: 5, publicId: 'pub-5', name: 'First' },
    ]);

    const result = await getFolderBreadcrumbsQuery(10, ORG_ID);
    // Should be sorted by path order: 5, 1, then current (10)
    expect(result[0].id).toBe(5);
    expect(result[1].id).toBe(1);
    expect(result[2].id).toBe(10);
  });
});
