import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  knowledgeEdge: { findMany: vi.fn() },
  knowledgeFinding: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { getBrainGraphQuery, parseGraphParams } =
  await import('../services/queries/get-brain-graph-query');

const ORG = 'org-1';
const pub = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  vi.clearAllMocks();
  db.knowledgePage.findMany.mockResolvedValue([
    {
      id: 1,
      publicId: pub(1),
      title: 'Urlop',
      type: 'POLICY',
      status: 'APPROVED',
    },
    {
      id: 2,
      publicId: pub(2),
      title: 'Kadry',
      type: 'ENTITY',
      status: 'CANDIDATE',
    },
    {
      id: 3,
      publicId: pub(3),
      title: 'Samotna',
      type: 'ENTITY',
      status: 'CANDIDATE',
    },
  ]);
  db.knowledgeEdge.findMany.mockResolvedValue([
    {
      fromPageId: 1,
      toPageId: 2,
      kind: 'dotyczy',
      origin: 'EXTRACTED',
      confidence: null,
    },
    {
      fromPageId: 2,
      toPageId: 9,
      kind: 'x',
      origin: 'EXTRACTED',
      confidence: null,
    },
  ]);
  db.knowledgeFinding.findMany.mockResolvedValue([
    { pageIds: [3] },
    { pageIds: [3, 99] },
  ]);
});

describe('getBrainGraphQuery', () => {
  it('reads the organization’s live pages and edges, scoped', async () => {
    await getBrainGraphQuery(ORG, {
      focus: null,
      hops: 1,
      budget: 150,
      includeInferred: false,
    });
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      status: { not: 'REJECTED' },
    });
    expect(db.knowledgeEdge.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
    });
    expect(db.knowledgeFinding.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      status: 'OPEN',
    });
  });

  it('pins pages with open findings first and counts them, dropping edges to missing pages', async () => {
    const view = await getBrainGraphQuery(ORG, {
      focus: null,
      hops: 1,
      budget: 150,
      includeInferred: false,
    });
    expect(view.nodes[0]).toMatchObject({ id: pub(3), openFindings: 2 });
    expect(view.edges).toHaveLength(1);
    expect(view.total).toEqual({ nodes: 3, edges: 1 });
    expect(view.budgets).toEqual([150, 300, 600, 1000]);
  });
});

describe('parseGraphParams', () => {
  it('clamps everything the URL says to what the server allows', () => {
    expect(
      parseGraphParams({ budget: '99999', hops: '7', focus: "' or 1=1" }),
    ).toEqual({
      focus: null,
      hops: 1,
      budget: 150,
      includeInferred: false,
    });
    expect(
      parseGraphParams({
        budget: '600',
        hops: '2',
        focus: pub(1),
        inferred: '1',
      }),
    ).toEqual({ focus: pub(1), hops: 2, budget: 600, includeInferred: true });
  });
});
