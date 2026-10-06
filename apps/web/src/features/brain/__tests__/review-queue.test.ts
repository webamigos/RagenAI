import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  userFile: { findMany: vi.fn() },
  knowledgePageSource: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const { getBrainReviewQueueQuery } =
  await import('../services/queries/get-brain-review-queue-query');
beforeEach(() => {
  vi.resetAllMocks();
  db.knowledgePage.findMany.mockResolvedValue([]);
  db.userFile.findMany.mockResolvedValue([]);
  db.knowledgePageSource.findMany.mockResolvedValue([]);
});
it('returns every candidate in stable order, with distinct scoped source documents', async () => {
  db.knowledgePage.findMany.mockResolvedValue([
    {
      publicId: 'p',
      title: 'Page',
      type: 'POLICY',
      sources: [{ fileId: 'f' }, { fileId: 'f' }],
    },
  ]);
  db.userFile.findMany.mockResolvedValue([{ id: 'f', fileName: 'Source.pdf' }]);
  expect(await getBrainReviewQueueQuery('org')).toEqual([
    {
      publicId: 'p',
      title: 'Page',
      type: 'POLICY',
      documents: [{ fileId: 'f', fileName: 'Source.pdf' }],
    },
  ]);
  expect(db.knowledgePage.findMany.mock.calls[0][0]).toMatchObject({
    where: { organizationId: 'org', status: 'CANDIDATE' },
    orderBy: [{ id: 'asc' }],
    select: { sources: { where: { organizationId: 'org' } } },
  });
  expect(db.userFile.findMany.mock.calls[0][0].where).toEqual({
    organizationId: 'org',
    id: { in: ['f'] },
  });
});
it('shares Brain language scope with the queue', async () => {
  db.userFile.findMany.mockResolvedValue([{ id: 'f' }]);
  db.knowledgePageSource.findMany.mockResolvedValue([{ pageId: 7 }]);
  await getBrainReviewQueueQuery('org', 'pol');
  expect(db.knowledgePage.findMany.mock.calls[0][0].where).toMatchObject({
    organizationId: 'org',
    id: { in: [7] },
  });
});
