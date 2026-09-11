import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock must be hoisted before imports
const mockCount = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      count: mockCount,
    },
  },
}));

import { getFileScopeCountsQuery } from '../get-file-scope-counts-query';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

/** The `where` each of the three counts ran with, keyed by call order. */
function whereClauses(): Record<string, unknown>[] {
  return mockCount.mock.calls.map(([arg]) => arg.where);
}

beforeEach(() => {
  mockCount.mockReset();
  mockCount.mockResolvedValue(0);
});

describe('getFileScopeCountsQuery', () => {
  it('counts each scope once', async () => {
    mockCount
      .mockResolvedValueOnce(240)
      .mockResolvedValueOnce(38)
      .mockResolvedValueOnce(14);

    const counts = await getFileScopeCountsQuery(ORG_ID, [], {
      userId: USER_ID,
    });

    expect(counts).toEqual({
      all: 240,
      'my-files': 38,
      'shared-with-me': 14,
    });
  });

  it('scopes every count to the organization', async () => {
    await getFileScopeCountsQuery(ORG_ID, [], { userId: USER_ID });

    for (const where of whereClauses()) {
      expect(where).toMatchObject({ organizationId: ORG_ID });
    }
  });

  /**
   * The rail's count describes the scope you would switch *to*. Narrowing the
   * current view must not change it, or a "Shared with me 0" that only means
   * "no shared file is also a PDF" sends people looking for a sharing bug.
   */
  it('ignores the selected folder, so no count carries a folder condition', async () => {
    await getFileScopeCountsQuery(ORG_ID, [], { userId: USER_ID });

    for (const where of whereClauses()) {
      expect(where).not.toHaveProperty('folderId');
    }
  });

  it('ignores the active filters, so no count carries one', async () => {
    await getFileScopeCountsQuery(ORG_ID, [], { userId: USER_ID });

    for (const where of whereClauses()) {
      expect(where).not.toHaveProperty('fileType');
      expect(where).not.toHaveProperty('embeddingStatus');
    }
  });

  it('restricts "my files" to the caller', async () => {
    await getFileScopeCountsQuery(ORG_ID, [], { userId: USER_ID });

    expect(whereClauses()[1]).toMatchObject({ ownerId: USER_ID });
  });

  /**
   * A count is a disclosure: telling a member the organization holds 240
   * documents they cannot reach is the leak #1006 and #1007 closed from the
   * other side. A non-member is refused rather than counted.
   */
  it('returns zeros without querying for a non-member', async () => {
    const counts = await getFileScopeCountsQuery(ORG_ID, [], {
      userId: USER_ID,
      scope: 'none',
    });

    expect(counts).toEqual({ all: 0, 'my-files': 0, 'shared-with-me': 0 });
    expect(mockCount).not.toHaveBeenCalled();
  });

  /**
   * `ownerId: undefined` is not a condition at all — Prisma drops it — so the
   * personal scopes would silently widen to every file in the organization.
   */
  it('returns zero for the personal scopes when there is no user', async () => {
    mockCount.mockResolvedValue(240);

    const counts = await getFileScopeCountsQuery(ORG_ID, []);

    expect(counts['my-files']).toBe(0);
    expect(counts['shared-with-me']).toBe(0);
    expect(mockCount).toHaveBeenCalledTimes(1);
  });
});
