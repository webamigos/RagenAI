import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFile: { findMany: vi.fn() },
  knowledgePageSource: { groupBy: vi.fn(), findMany: vi.fn() },
  knowledgePage: { groupBy: vi.fn(), count: vi.fn() },
  knowledgeFinding: { groupBy: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: vi.fn().mockResolvedValue(false) }),
);
const backlog = vi.hoisted(() => ({ getPublicationBacklogQuery: vi.fn() }));
vi.mock('../services/queries/get-publication-backlog-query', () => backlog);
const { getBrainOverviewQuery } =
  await import('../services/queries/get-brain-overview-query');

beforeEach(() => {
  vi.resetAllMocks();
  db.userFile.findMany.mockResolvedValue([]);
  db.knowledgePageSource.findMany.mockResolvedValue([]);
  db.knowledgePageSource.groupBy.mockResolvedValue([]);
  db.knowledgePage.groupBy.mockResolvedValue([]);
  db.knowledgeFinding.groupBy.mockResolvedValue([]);
  db.knowledgePage.count.mockResolvedValue(0);
  backlog.getPublicationBacklogQuery.mockResolvedValue({
    pending: 0,
    refused: {},
  });
});

describe('getBrainOverviewQuery', () => {
  it('returns zero counts without invented sample data', async () => {
    expect(await getBrainOverviewQuery('org')).toMatchObject({
      documents: 0,
      emptyDocuments: 0,
      candidates: 0,
      approved: 0,
      published: 0,
      awaitingPublication: 0,
      unownedCandidates: 0,
      openFindings: {},
      topDocuments: [],
    });
  });

  it('counts what publishing all would write, organization-wide', async () => {
    backlog.getPublicationBacklogQuery.mockResolvedValue({
      pending: 2,
      refused: { 'owner-required': 1 },
    });
    const overview = await getBrainOverviewQuery('org');
    expect(overview.awaitingPublication).toBe(2);
    expect(backlog.getPublicationBacklogQuery).toHaveBeenCalledWith('org');
  });

  it('keeps page totals separate from per-file citations, and ranks by candidates', async () => {
    db.userFile.findMany.mockResolvedValue(
      ['a', 'b', 'c'].map((id) => ({
        id,
        fileName: `${id}.pdf`,
        embeddingStatus: 'COMPLETED',
        createdAt: null,
        language: 'pol',
      })),
    );
    db.knowledgePageSource.groupBy.mockImplementation(({ where }) =>
      Promise.resolve(
        where.page.status === 'APPROVED'
          ? [
              { fileId: 'a', pageId: 1 },
              { fileId: 'b', pageId: 1 },
            ]
          : [
              { fileId: 'a', pageId: 2 },
              { fileId: 'b', pageId: 2 },
              { fileId: 'b', pageId: 3 },
            ],
      ),
    );
    db.knowledgePageSource.findMany.mockResolvedValue([
      { fileId: 'a' },
      { fileId: 'b' },
    ]);
    db.knowledgePage.groupBy.mockResolvedValue([
      { status: 'APPROVED', _count: { _all: 1 } },
      { status: 'CANDIDATE', _count: { _all: 2 } },
    ]);
    db.knowledgePage.count.mockImplementation(({ where }) => {
      if (where.ownerId === null) {
        return Promise.resolve(2);
      }
      return Promise.resolve(where.publishedAt === null ? 0 : 1);
    });
    db.knowledgeFinding.groupBy.mockImplementation(({ by }) =>
      Promise.resolve(
        by[0] === 'type' ? [{ type: 'ORPHAN', _count: { _all: 3 } }] : [],
      ),
    );
    const result = await getBrainOverviewQuery('org');
    expect(result).toMatchObject({
      documents: 3,
      emptyDocuments: 1,
      candidates: 2,
      approved: 1,
      published: 1,
      unownedCandidates: 2,
      openFindings: { ORPHAN: 3 },
    });
    expect(result.topDocuments.map((file) => file.fileId)).toEqual(['b', 'a']);
    expect(result.topDocuments[0]).toMatchObject({
      candidatePages: 2,
      approvedPages: 1,
    });
    for (const model of Object.values(db)) {
      for (const method of Object.values(model)) {
        for (const [args] of method.mock.calls) {
          expect(JSON.stringify(args.where)).toContain(
            '"organizationId":"org"',
          );
        }
      }
    }
  });

  it('applies the same language scope to page metrics and open findings', async () => {
    db.userFile.findMany.mockResolvedValue([
      {
        id: 'pl',
        fileName: 'Polski.pdf',
        language: 'pol',
        embeddingStatus: 'COMPLETED',
        createdAt: null,
      },
    ]);
    db.knowledgePageSource.findMany.mockImplementation(({ select }) =>
      Promise.resolve(select.pageId ? [{ pageId: 7 }] : [{ fileId: 'pl' }]),
    );
    await getBrainOverviewQuery('org', 'pol');
    for (const [args] of db.knowledgePage.count.mock.calls) {
      expect(args.where).toMatchObject({
        organizationId: 'org',
        id: { in: [7] },
      });
    }
    const findings = db.knowledgeFinding.groupBy.mock.calls.find(
      ([args]) => args.by[0] === 'type',
    )![0];
    expect(findings.where).toMatchObject({
      organizationId: 'org',
      status: 'OPEN',
      OR: [{ fileId: { in: ['pl'] } }, { pageIds: { hasSome: [7] } }],
    });
  });
});
