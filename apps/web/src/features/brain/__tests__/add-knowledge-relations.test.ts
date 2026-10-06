import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  knowledgePage: { findMany: vi.fn(), updateMany: vi.fn() },
  knowledgeEdge: { createMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) },
}));
const reconcile = vi.hoisted(() => vi.fn());
vi.mock('../services/commands/start-findings-reconcile', () => ({
  startFindingsReconcile: reconcile,
}));
import { addKnowledgeRelationsCommand } from '../services/commands/add-knowledge-relations-command';
import { addRelationsInputSchema } from '../contracts/brain-review.types';
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-10-06T12:00:00Z');
const input = {
  orgId: 'org',
  actorId: 'actor',
  publicId: A,
  expectedUpdatedAt: now.toISOString(),
  targets: [
    { publicId: B, expectedUpdatedAt: now.toISOString(), kind: 'related to' },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  tx.knowledgePage.findMany.mockResolvedValue([
    { id: 1, publicId: A, status: 'APPROVED', updatedAt: now },
    { id: 2, publicId: B, status: 'CANDIDATE', updatedAt: now },
  ]);
  tx.knowledgeEdge.createMany.mockResolvedValue({ count: 1 });
});
it('locks both endpoints in stable order and inserts inferred scoped relations, then reconciles', async () => {
  expect(await addKnowledgeRelationsCommand(input)).toEqual({
    success: true,
    changed: true,
  });
  expect(tx.$queryRaw.mock.calls[0][0].sql).toMatch(/ORDER BY id FOR UPDATE/);
  expect(tx.$queryRaw.mock.calls[0][0].values).toContain('org');
  expect(tx.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
    organizationId: 'org',
    publicId: { in: [A, B] },
  });
  expect(tx.knowledgeEdge.createMany).toHaveBeenCalledWith({
    data: [
      {
        organizationId: 'org',
        fromPageId: 1,
        toPageId: 2,
        kind: 'related to',
        origin: 'INFERRED',
      },
    ],
    skipDuplicates: true,
  });
  expect(tx.knowledgePage.updateMany.mock.calls[0][0].where).toEqual({
    organizationId: 'org',
    id: { in: [1, 2] },
  });
  expect(reconcile).toHaveBeenCalledWith('org');
});
it.each(['source', 'target'])(
  'refuses a changed %s without writing an edge',
  async (endpoint) => {
    const changed = new Date(now.getTime() + 1);
    tx.knowledgePage.findMany.mockResolvedValue([
      {
        id: 1,
        publicId: A,
        status: 'APPROVED',
        updatedAt: endpoint === 'source' ? changed : now,
      },
      {
        id: 2,
        publicId: B,
        status: 'CANDIDATE',
        updatedAt: endpoint === 'target' ? changed : now,
      },
    ]);
    expect(await addKnowledgeRelationsCommand(input)).toEqual({
      success: false,
      error: 'conflict',
    });
    expect(tx.knowledgeEdge.createMany).not.toHaveBeenCalled();
  },
);
it('refuses missing or foreign endpoints and self links', async () => {
  tx.knowledgePage.findMany.mockResolvedValue([]);
  expect(await addKnowledgeRelationsCommand(input)).toEqual({
    success: false,
    error: 'not-found',
  });
  expect(
    await addKnowledgeRelationsCommand({
      ...input,
      targets: [{ ...input.targets[0], publicId: A }],
    }),
  ).toEqual({ success: false, error: 'invalid-input' });
  expect(tx.knowledgeEdge.createMany).not.toHaveBeenCalled();
});
it('rejects a rejected endpoint; an existing edge is a no-op', async () => {
  tx.knowledgePage.findMany.mockResolvedValue([
    { id: 1, publicId: A, status: 'REJECTED', updatedAt: now },
    { id: 2, publicId: B, status: 'APPROVED', updatedAt: now },
  ]);
  expect(await addKnowledgeRelationsCommand(input)).toEqual({
    success: false,
    error: 'invalid-status',
  });
  tx.knowledgePage.findMany.mockResolvedValue([
    { id: 1, publicId: A, status: 'APPROVED', updatedAt: now },
    { id: 2, publicId: B, status: 'APPROVED', updatedAt: now },
  ]);
  tx.knowledgeEdge.createMany.mockResolvedValue({ count: 0 });
  expect(await addKnowledgeRelationsCommand(input)).toEqual({
    success: true,
    changed: false,
  });
  expect(reconcile).not.toHaveBeenCalled();
  expect(tx.knowledgePage.updateMany).not.toHaveBeenCalled();
});
it('validates ids, versions, bounds and relation kinds before reaching the command', () => {
  expect(addRelationsInputSchema.safeParse(input).success).toBe(true);
  for (const bad of [
    { ...input, targets: [] },
    { ...input, publicId: 'bad' },
    { ...input, targets: [{ ...input.targets[0], kind: '' }] },
    { ...input, targets: Array(31).fill(input.targets[0]) },
  ]) {
    expect(addRelationsInputSchema.safeParse(bad).success).toBe(false);
  }
});
