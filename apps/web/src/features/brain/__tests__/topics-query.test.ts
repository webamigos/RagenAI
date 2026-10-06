import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  knowledgeEdge: { findMany: vi.fn() },
  knowledgeFinding: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const { getBrainTopicsQuery } =
  await import('../services/queries/get-brain-topics-query');
beforeEach(() => {
  vi.resetAllMocks();
  db.knowledgePage.findMany.mockResolvedValue(
    Array.from({ length: 151 }, (_, i) => ({
      id: i,
      publicId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: String(i),
      type: 'ENTITY',
      status: i ? 'CANDIDATE' : 'APPROVED',
    })),
  );
  db.knowledgeEdge.findMany.mockResolvedValue(
    Array.from({ length: 150 }, (_, i) => ({
      fromPageId: 0,
      toPageId: i + 1,
      kind: 'dotyczy',
      origin: 'EXTRACTED',
      confidence: null,
    })),
  );
  db.knowledgeFinding.findMany.mockResolvedValue([]);
});
it('reads every live scoped page and returns complete counts beyond the canvas budget', async () => {
  const summary = await getBrainTopicsQuery('session-org');
  expect(summary.pages).toHaveLength(151);
  expect(
    summary.topics.reduce((sum, group) => sum + group.pages.length, 0),
  ).toBe(151);
  expect(summary.topics.reduce((sum, group) => sum + group.approved, 0)).toBe(
    1,
  );
  for (const model of Object.values(db)) {
    expect(model.findMany.mock.calls[0][0].where.organizationId).toBe(
      'session-org',
    );
  }
  expect(db.knowledgePage.findMany.mock.calls[0][0].take).toBeUndefined();
});
it('narrows the partition to the language scope and drops edges with a missing end', async () => {
  db.knowledgePage.findMany.mockResolvedValue([
    {
      id: 0,
      publicId: '00000000-0000-4000-8000-000000000000',
      title: 'A',
      type: 'ENTITY',
      status: 'APPROVED',
    },
  ]);
  const summary = await getBrainTopicsQuery('session-org', {
    fileIds: [],
    pageIds: [0],
  });
  expect(db.knowledgePage.findMany.mock.calls[0][0].where.id).toEqual({
    in: [0],
  });
  expect(summary.isolated).toHaveLength(1);
  expect(summary.topics).toEqual([]);
});
