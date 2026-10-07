import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  documentPair: { findMany: vi.fn() },
  knowledgePageSource: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const isFeatureEnabled = vi.hoisted(() => vi.fn());
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: isFeatureEnabled }),
);

import { getPairedPageCandidatesQuery } from '../services/queries/get-paired-page-candidates-query';

const source = (
  fileId: string,
  pageId: number,
  status: 'CANDIDATE' | 'APPROVED' | 'STALE',
  createdAt = '2026-10-01T00:00:00Z',
) => ({
  fileId,
  pageId,
  page: { publicId: `page-${pageId}`, status, createdAt: new Date(createdAt) },
});

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabled.mockResolvedValue(true);
  db.documentPair.findMany.mockResolvedValue([
    { fileAId: 'en', fileBId: 'pl' },
  ]);
});

describe('getPairedPageCandidatesQuery', () => {
  it('counts a candidate when another live page cites the other language', async () => {
    db.knowledgePageSource.findMany.mockResolvedValue([
      source('pl', 1, 'CANDIDATE'),
      source('en', 2, 'APPROVED'),
    ]);
    await expect(getPairedPageCandidatesQuery('org')).resolves.toEqual({
      count: 1,
      firstPublicId: 'page-1',
    });
  });

  it('counts both when both are candidates, and starts from the older one', async () => {
    db.knowledgePageSource.findMany.mockResolvedValue([
      source('pl', 1, 'CANDIDATE', '2026-10-03T00:00:00Z'),
      source('en', 2, 'CANDIDATE', '2026-10-02T00:00:00Z'),
    ]);
    await expect(getPairedPageCandidatesQuery('org')).resolves.toEqual({
      count: 2,
      firstPublicId: 'page-2',
    });
  });

  it('does not count a page that cites both halves and nothing else does', async () => {
    db.knowledgePageSource.findMany.mockResolvedValue([
      source('pl', 1, 'CANDIDATE'),
      source('en', 1, 'CANDIDATE'),
    ]);
    await expect(getPairedPageCandidatesQuery('org')).resolves.toEqual({
      count: 0,
      firstPublicId: null,
    });
  });

  it('does not count approved pages, which a merge never absorbs', async () => {
    db.knowledgePageSource.findMany.mockResolvedValue([
      source('pl', 3, 'APPROVED'),
      source('en', 4, 'APPROVED'),
    ]);
    await expect(getPairedPageCandidatesQuery('org')).resolves.toEqual({
      count: 0,
      firstPublicId: null,
    });
  });

  it('counts a candidate that cites both halves when an approved page cites one', async () => {
    db.knowledgePageSource.findMany.mockResolvedValue([
      source('pl', 1, 'CANDIDATE'),
      source('en', 1, 'CANDIDATE'),
      source('pl', 3, 'APPROVED'),
    ]);
    await expect(getPairedPageCandidatesQuery('org')).resolves.toEqual({
      count: 1,
      firstPublicId: 'page-1',
    });
  });

  it('scopes by organization and reads only live pages', async () => {
    db.knowledgePageSource.findMany.mockResolvedValue([]);
    await getPairedPageCandidatesQuery('org');
    expect(db.documentPair.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org',
    });
    const where = db.knowledgePageSource.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org');
    expect(where.page.status.in).toEqual(['CANDIDATE', 'APPROVED', 'STALE']);
  });

  it('reads nothing while the feature is off or with no pairs', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    await getPairedPageCandidatesQuery('org');
    expect(db.documentPair.findMany).not.toHaveBeenCalled();
    isFeatureEnabled.mockResolvedValue(true);
    db.documentPair.findMany.mockResolvedValue([]);
    await expect(getPairedPageCandidatesQuery('org')).resolves.toEqual({
      count: 0,
      firstPublicId: null,
    });
    expect(db.knowledgePageSource.findMany).not.toHaveBeenCalled();
  });
});
