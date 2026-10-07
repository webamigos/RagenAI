import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  knowledgePageSource: { findMany: vi.fn() },
  documentPair: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const isFeatureEnabled = vi.hoisted(() => vi.fn());
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: isFeatureEnabled }),
);

const { getMergeTargetsQuery, baseSlug, normalizeTitle } =
  await import('../services/queries/get-merge-targets-query');

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabled.mockResolvedValue(false);
});

describe('getMergeTargetsQuery', () => {
  it('offers every live page but this one, same-subject pages first', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      {
        id: 1,
        publicId: 'a',
        title: 'Kadry',
        slug: 'kadry',
        status: 'APPROVED',
      },
      {
        id: 2,
        publicId: 'b',
        title: 'Urlop  wypoczynkowy',
        slug: 'urlop',
        status: 'APPROVED',
      },
      {
        id: 3,
        publicId: 'c',
        title: 'Inny tytuł',
        slug: 'urlop-wypoczynkowy-3',
        status: 'CANDIDATE',
      },
    ]);
    const targets = await getMergeTargetsQuery('org-1', {
      id: 5,
      title: 'Urlop wypoczynkowy',
      slug: 'urlop-wypoczynkowy-2',
    });
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      id: { not: 5 },
      status: { in: ['CANDIDATE', 'APPROVED', 'STALE'] },
    });
    expect(targets.map((t) => [t.publicId, t.suggested])).toEqual([
      ['b', true],
      ['c', true],
      ['a', false],
    ]);
  });

  it('normalizes titles and strips only a numeric suffix from slugs', () => {
    expect(normalizeTitle('  Urlop\tWYPOCZYNKOWY ')).toBe('urlop wypoczynkowy');
    expect(baseSlug('urlop-2')).toBe('urlop');
    expect(baseSlug('rok-2026-plan')).toBe('rok-2026-plan');
  });

  describe('pages that cite the other language of a paired document', () => {
    const rows = [
      {
        id: 1,
        publicId: 'a',
        title: 'Kadry',
        slug: 'kadry',
        status: 'APPROVED',
      },
      {
        id: 2,
        publicId: 'en',
        title: 'Leave',
        slug: 'leave',
        status: 'APPROVED',
      },
      {
        id: 3,
        publicId: 'x',
        title: 'Urlop',
        slug: 'urlop',
        status: 'APPROVED',
      },
    ];
    const here = { id: 9, title: 'Urlop', slug: 'urlop-2' };

    beforeEach(() => {
      isFeatureEnabled.mockResolvedValue(true);
      db.knowledgePage.findMany.mockResolvedValue(rows);
      db.knowledgePageSource.findMany
        .mockResolvedValueOnce([{ fileId: 'pl-file' }])
        .mockResolvedValueOnce([{ pageId: 2 }]);
      db.documentPair.findMany.mockResolvedValue([
        { fileAId: 'en-file', fileBId: 'pl-file' },
      ]);
    });

    it('lists them first, ahead of same-subject suggestions', async () => {
      const targets = await getMergeTargetsQuery('org-1', here);
      expect(targets.map((t) => t.publicId)).toEqual(['en', 'x', 'a']);
      expect(targets[0]).toMatchObject({ sameContentInOtherLanguage: true });
      expect(targets[1]!.sameContentInOtherLanguage).toBeUndefined();
    });

    it('looks the pages up by organization and excludes this page', async () => {
      await getMergeTargetsQuery('org-1', here);
      expect(db.knowledgePageSource.findMany.mock.calls[0][0].where).toEqual({
        organizationId: 'org-1',
        pageId: 9,
      });
      expect(db.knowledgePageSource.findMany.mock.calls[1][0].where).toEqual({
        organizationId: 'org-1',
        fileId: { in: ['en-file'] },
        pageId: { not: 9 },
      });
      expect(
        db.documentPair.findMany.mock.calls[0][0].where.organizationId,
      ).toBe('org-1');
    });

    it('marks nothing while the feature is off', async () => {
      isFeatureEnabled.mockResolvedValue(false);
      const targets = await getMergeTargetsQuery('org-1', here);
      expect(db.documentPair.findMany).not.toHaveBeenCalled();
      expect(targets.some((t) => t.sameContentInOtherLanguage)).toBe(false);
    });

    it('marks nothing when the page cites no paired document', async () => {
      db.knowledgePageSource.findMany.mockReset();
      db.knowledgePageSource.findMany.mockResolvedValueOnce([
        { fileId: 'solo' },
      ]);
      db.documentPair.findMany.mockResolvedValue([]);
      const targets = await getMergeTargetsQuery('org-1', here);
      expect(targets.some((t) => t.sameContentInOtherLanguage)).toBe(false);
      expect(db.knowledgePageSource.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
