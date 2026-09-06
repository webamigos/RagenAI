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
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ fileType: expect.anything() }),
      }),
    );
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
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          embeddingStatus: expect.anything(),
        }),
      }),
    );
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

describe('getUserFilesQuery — access control', () => {
  it('viewMode my-files scopes to ownerId = userId', async () => {
    await getUserFilesQuery(ORG_ID, [], {
      userId: 'user-1',
      viewMode: 'my-files',
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: 'user-1' }),
      }),
    );
  });

  it("the 'organization' scope skips OR permission filters", async () => {
    await getUserFilesQuery(ORG_ID, [], {
      userId: 'user-1',
      scope: 'organization',
      viewMode: 'all',
    });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('OR');
  });

  it("the 'member' scope adds OR permission filters", async () => {
    await getUserFilesQuery(ORG_ID, [], {
      userId: 'user-1',
      scope: 'member',
      viewMode: 'all',
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
  });

  it('viewMode shared-with-me excludes own files and adds permission OR conditions', async () => {
    await getUserFilesQuery(ORG_ID, [], {
      userId: 'user-1',
      viewMode: 'shared-with-me',
    });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.ownerId).toEqual({ not: null, notIn: ['user-1'] });
    expect(call.where.OR).toBeDefined();
    expect(Array.isArray(call.where.OR)).toBe(true);
  });

  it('team conditions excluded when userTeamIds is empty', async () => {
    await getUserFilesQuery(ORG_ID, [], {
      userId: 'user-1',
      scope: 'member',
      viewMode: 'all',
    });
    const call = mockFindMany.mock.calls[0][0];
    const orConditions = call.where.OR as Array<Record<string, unknown>>;
    const hasTeamFolderCondition = orConditions.some(
      (c) => c.folder && (c.folder as Record<string, unknown>).teamId,
    );
    expect(hasTeamFolderCondition).toBe(false);
  });

  it('folderId filter is applied', async () => {
    await getUserFilesQuery(ORG_ID, [], { folderId: 'folder-abc' });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ folderId: 'folder-abc' }),
      }),
    );
  });
});

describe('getUserFilesQuery — user-scoped views without a user id', () => {
  /**
   * Prisma drops a condition whose value is `undefined` rather than matching
   * nothing, so `ownerId: undefined` would have widened "my files" to every
   * file in the org and `granteeId: undefined` would have made "shared with
   * me" match any grant to anyone. Both views are defined purely in terms of
   * who is asking, so with no user id the only safe answer is nothing.
   */
  it('returns an empty page for my-files and queries nothing', async () => {
    const result = await getUserFilesQuery(ORG_ID, [], {
      viewMode: 'my-files',
      userId: undefined,
    });

    expect(result).toEqual({
      items: [],
      totalCount: 0,
      totalPages: 1,
      page: 1,
      pageSize: 25,
    });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it('returns an empty page for shared-with-me and queries nothing', async () => {
    const result = await getUserFilesQuery(ORG_ID, [], {
      viewMode: 'shared-with-me',
      userId: undefined,
    });

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('preserves the requested page and size in the empty result', async () => {
    const result = await getUserFilesQuery(ORG_ID, [], {
      viewMode: 'my-files',
      page: 3,
      pageSize: 10,
    });

    expect(result).toMatchObject({ page: 3, pageSize: 10, totalPages: 1 });
  });

  it('still queries for the default view, which does not depend on a user id', async () => {
    // 'all' is legitimately reachable without one — an org admin sees
    // everything, and unowned files are org-wide.
    await getUserFilesQuery(ORG_ID, [], {
      viewMode: 'all',
      scope: 'organization',
    });
    expect(mockFindMany).toHaveBeenCalled();
  });

  it('builds no undefined-valued predicate when a user id is present', async () => {
    await getUserFilesQuery(ORG_ID, ['team-1'], {
      viewMode: 'shared-with-me',
      userId: 'user-1',
    });

    const where = mockFindMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).not.toContain('undefined');
    expect(where.ownerId).toEqual({ not: null, notIn: ['user-1'] });
  });
});
