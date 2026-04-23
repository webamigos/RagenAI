import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock must be hoisted before imports
const mockFindMany = vi.hoisted(() => vi.fn());
const mockCount = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}));

import { getUserFilesQuery } from '../get-user-files-query';
import { FileType, EmbeddingStatus } from '@/generated/prisma/client';

const ORG_ID = 'org-1';

beforeEach(() => {
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
});

describe('getUserFilesQuery — sorting', () => {
  it('defaults to createdAt desc', async () => {
    await getUserFilesQuery(ORG_ID);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('sorts by fileName asc', async () => {
    await getUserFilesQuery(ORG_ID, [], { sort: 'fileName', dir: 'asc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fileName: 'asc' } }),
    );
  });

  it('sorts by fileSize desc', async () => {
    await getUserFilesQuery(ORG_ID, [], { sort: 'fileSize', dir: 'desc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fileSize: 'desc' } }),
    );
  });

  it('sorts by fileType asc', async () => {
    await getUserFilesQuery(ORG_ID, [], { sort: 'fileType', dir: 'asc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fileType: 'asc' } }),
    );
  });
});

describe('getUserFilesQuery — filtering', () => {
  it('adds fileType filter when provided', async () => {
    await getUserFilesQuery(ORG_ID, [], {
      fileType: [FileType.PDF, FileType.DOCX],
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fileType: { in: [FileType.PDF, FileType.DOCX] },
        }),
      }),
    );
  });

  it('omits fileType filter when array is empty', async () => {
    await getUserFilesQuery(ORG_ID, [], { fileType: [] });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('fileType');
  });

  it('adds embeddingStatus filter when provided', async () => {
    await getUserFilesQuery(ORG_ID, [], {
      embeddingStatus: [EmbeddingStatus.COMPLETED],
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          embeddingStatus: { in: [EmbeddingStatus.COMPLETED] },
        }),
      }),
    );
  });

  it('omits embeddingStatus filter when array is empty', async () => {
    await getUserFilesQuery(ORG_ID, [], { embeddingStatus: [] });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('embeddingStatus');
  });

  it('always scopes by organizationId', async () => {
    await getUserFilesQuery('my-org', [], {
      fileType: [FileType.PDF],
      embeddingStatus: [EmbeddingStatus.FAILED],
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'my-org' }),
      }),
    );
  });
});

describe('getUserFilesQuery — pagination', () => {
  it('defaults to page 1, pageSize 25', async () => {
    await getUserFilesQuery(ORG_ID);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 }),
    );
  });

  it('computes skip correctly for page 2', async () => {
    await getUserFilesQuery(ORG_ID, [], { page: 2, pageSize: 25 });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
  });

  it('uses custom pageSize', async () => {
    await getUserFilesQuery(ORG_ID, [], { page: 3, pageSize: 10 });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('returns correct totalPages', async () => {
    mockCount.mockResolvedValue(55);
    const result = await getUserFilesQuery(ORG_ID, [], { pageSize: 25 });
    expect(result.totalPages).toBe(3);
    expect(result.totalCount).toBe(55);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it('returns totalPages=1 when count is 0', async () => {
    mockCount.mockResolvedValue(0);
    const result = await getUserFilesQuery(ORG_ID);
    expect(result.totalPages).toBe(1);
  });
});
