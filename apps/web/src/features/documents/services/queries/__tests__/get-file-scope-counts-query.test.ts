import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock must be hoisted before imports
const mockAggregate = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      aggregate: mockAggregate,
    },
  },
}));

/** What one scope's aggregate answers with. */
const totals = (files: number, pages: number | null = 0) => ({
  _count: { _all: files },
  _sum: { pageCount: pages },
});

import { getFileScopeCountsQuery } from '../get-file-scope-counts-query';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

/** The `where` each of the three aggregates ran with, keyed by call order. */
function whereClauses(): Record<string, unknown>[] {
  return mockAggregate.mock.calls.map(([arg]) => arg.where);
}

beforeEach(() => {
  mockAggregate.mockReset();
  mockAggregate.mockResolvedValue(totals(0));
});

describe('getFileScopeCountsQuery', () => {
  it('counts each scope once, with the pages those files add up to', async () => {
    mockAggregate
      .mockResolvedValueOnce(totals(240, 4812))
      .mockResolvedValueOnce(totals(38, 700))
      .mockResolvedValueOnce(totals(14, 120));

    const counts = await getFileScopeCountsQuery(ORG_ID, [], {
      userId: USER_ID,
    });

    expect(counts).toEqual({
      all: { files: 240, pages: 4812 },
      'my-files': { files: 38, pages: 700 },
      'shared-with-me': { files: 14, pages: 120 },
    });
  });

  /**
   * `pageCount` is nullable, and a scope of files that never reported one
   * sums to `null`. Rendering that as a page total would print "~null pages";
   * it is zero pages known, which is what the heading then omits.
   */
  it('reads a null page sum as zero pages', async () => {
    mockAggregate.mockResolvedValue(totals(3, null));

    const counts = await getFileScopeCountsQuery(ORG_ID, [], {
      userId: USER_ID,
    });

    expect(counts.all).toEqual({ files: 3, pages: 0 });
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

    expect(counts).toEqual({
      all: { files: 0, pages: 0 },
      'my-files': { files: 0, pages: 0 },
      'shared-with-me': { files: 0, pages: 0 },
    });
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  /**
   * `ownerId: undefined` is not a condition at all — Prisma drops it — so the
   * personal scopes would silently widen to every file in the organization.
   */
  it('returns zero for the personal scopes when there is no user', async () => {
    mockAggregate.mockResolvedValue(totals(240, 4812));

    const counts = await getFileScopeCountsQuery(ORG_ID, []);

    expect(counts['my-files']).toEqual({ files: 0, pages: 0 });
    expect(counts['shared-with-me']).toEqual({ files: 0, pages: 0 });
    expect(mockAggregate).toHaveBeenCalledTimes(1);
  });
});
