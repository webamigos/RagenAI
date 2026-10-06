import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  knowledgeFinding: { findMany: vi.fn() },
  knowledgePage: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
import { getOrphanRelationsQuery } from '../services/queries/get-orphan-relations-query';
const now = new Date('2026-10-06T12:00:00Z');
const source = {
  id: 1,
  publicId: 'source',
  title: 'Source',
  updatedAt: now,
  sources: [{ fileId: 'shared' }],
};
beforeEach(() => vi.resetAllMocks());
it('batches shared-source suggestions and keeps every read scoped to the organization', async () => {
  db.knowledgeFinding.findMany.mockResolvedValue([
    { publicId: 'finding', pageIds: [1] },
  ]);
  db.knowledgePage.findMany
    .mockResolvedValueOnce([source])
    .mockResolvedValueOnce([
      source,
      { ...source, id: 2, publicId: 'target', title: 'Target' },
      {
        ...source,
        id: 3,
        publicId: 'unrelated',
        sources: [{ fileId: 'other' }],
      },
    ]);
  const proposals = await getOrphanRelationsQuery('org', ['finding']);
  expect(proposals.get('finding')).toMatchObject({
    action: 'ADD_RELATIONS',
    reason: 'shared-source-document',
    page: { publicId: 'source', updatedAt: now.toISOString() },
    targets: [
      { publicId: 'target', kind: 'related to', updatedAt: now.toISOString() },
    ],
  });
  expect(db.knowledgePage.findMany).toHaveBeenCalledTimes(2);
  for (const call of [
    ...db.knowledgePage.findMany.mock.calls,
    ...db.knowledgeFinding.findMany.mock.calls,
  ]) {
    expect(call[0].where.organizationId).toBe('org');
  }
  expect(db.knowledgeFinding.findMany.mock.calls[0][0].where).toMatchObject({
    status: 'OPEN',
    type: 'ORPHAN',
  });
  expect(db.knowledgePage.findMany.mock.calls[1][0].where.sources.some).toEqual(
    {
      organizationId: 'org',
      fileId: { in: ['shared'] },
      sourceDeletedAt: null,
    },
  );
});
it('offers no fabricated relation for a removed source, malformed finding or missing page', async () => {
  db.knowledgeFinding.findMany.mockResolvedValue([
    { publicId: 'bad', pageIds: [1, 2] },
  ]);
  expect(await getOrphanRelationsQuery('org', ['bad'])).toEqual(new Map());
  expect(db.knowledgePage.findMany).not.toHaveBeenCalled();
  db.knowledgeFinding.findMany.mockResolvedValue([
    { publicId: 'gone', pageIds: [1] },
  ]);
  db.knowledgePage.findMany.mockResolvedValueOnce([{ ...source, sources: [] }]);
  expect(await getOrphanRelationsQuery('org', ['gone'])).toEqual(new Map());
});
it('does not query for no visible orphan findings', async () => {
  expect(await getOrphanRelationsQuery('org', [])).toEqual(new Map());
  expect(db.knowledgeFinding.findMany).not.toHaveBeenCalled();
});
