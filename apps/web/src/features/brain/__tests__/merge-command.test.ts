import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The merge (spec D2b) against a transaction double. What it pins: the
 * target gains the absorbed page's claims and the narrower access, returns
 * to review, relations move without self-loops or downgrades, the absorbed
 * page is rejected and superseded, and both get a ledger row.
 */

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  knowledgePage: { findFirst: vi.fn(), updateMany: vi.fn() },
  knowledgePageSource: { createMany: vi.fn() },
  knowledgeEdge: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  knowledgeDecision: { createMany: vi.fn() },
}));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const reconcile = vi.hoisted(() => ({ startFindingsReconcile: vi.fn() }));
vi.mock('../services/commands/start-findings-reconcile', () => reconcile);

const { mergeKnowledgePagesCommand } =
  await import('../services/commands/merge-knowledge-pages-command');

const ORG = 'org-1';
const SEEN = new Date('2026-09-23T10:00:00.000Z');
const ABSORBED = '11111111-2222-4333-8444-555555555555';
const TARGET = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const input = {
  orgId: ORG,
  actorId: 'u-admin',
  publicId: ABSORBED,
  expectedUpdatedAt: SEEN.toISOString(),
  targetPublicId: TARGET,
};

const src = (quote: string) => ({
  fileId: 'f1',
  documentVersionId: 'v1',
  span: '§1',
  quote,
  hash: `h-${quote}`,
});
const render = (title: string, claims: string[]) =>
  [
    `# ${title}`,
    '',
    'Opis.',
    '',
    ...claims.map((c, i) => `- ${c} [${i + 1}]`),
    '',
    '---',
    '',
    ...claims.map((c, i) => `${i + 1}. „${c}”`),
    '',
  ].join('\n');

function pages(over: { absorbed?: object; target?: object } = {}) {
  const absorbed = {
    id: 2,
    publicId: ABSORBED,
    status: 'CANDIDATE',
    content: render('Onboarding', ['B']),
    contentHash: 'sha256:a',
    accessibleBy: ['user:u1'],
    publishedAt: null,
    updatedAt: SEEN,
    sources: [src('B')],
    ...over.absorbed,
  };
  const target = {
    id: 1,
    publicId: TARGET,
    status: 'APPROVED',
    content: render('Wdrożenie', ['A']),
    contentHash: 'sha256:t',
    accessibleBy: [`org:${ORG}`],
    publishedAt: null,
    updatedAt: SEEN,
    sources: [src('A')],
    ...over.target,
  };
  tx.$queryRaw.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  tx.knowledgePage.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(where.publicId === ABSORBED ? absorbed : target),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.knowledgeEdge.findMany.mockResolvedValue([]);
});

describe('mergeKnowledgePagesCommand', () => {
  it('folds the candidate into the target and records both sides', async () => {
    pages();
    await expect(mergeKnowledgePagesCommand(input)).resolves.toEqual({
      success: true,
      changed: true,
    });

    const [targetUpdate, absorbedUpdate] =
      tx.knowledgePage.updateMany.mock.calls.map(([a]) => a);
    expect(targetUpdate.where).toEqual({ organizationId: ORG, id: 1 });
    expect(targetUpdate.data).toMatchObject({
      status: 'CANDIDATE',
      // org-wide ∩ user:u1 — the narrower wins.
      accessibleBy: ['user:u1'],
    });
    expect(targetUpdate.data.content).toContain('- B [2]');
    expect(absorbedUpdate).toEqual({
      where: { organizationId: ORG, id: 2 },
      data: { status: 'REJECTED', supersededById: 1 },
    });
    expect(tx.knowledgePageSource.createMany.mock.calls[0][0].data).toEqual([
      { organizationId: ORG, pageId: 1, ...src('B') },
    ]);
    const decisions = tx.knowledgeDecision.createMany.mock.calls[0][0].data;
    expect(
      decisions.map((d: { pageId: number; action: string }) => [
        d.pageId,
        d.action,
      ]),
    ).toEqual([
      [1, 'MERGE'],
      [2, 'MERGE'],
    ]);
    expect(decisions[0].after).toMatchObject({
      absorbed: ABSORBED,
      sources: 2,
    });
    expect(decisions[1].after).toEqual({
      status: 'REJECTED',
      mergedInto: TARGET,
    });
    expect(reconcile.startFindingsReconcile).toHaveBeenCalledWith(ORG);
  });

  it('locks both rows in id order, inside the organization', async () => {
    pages();
    await mergeKnowledgePagesCommand(input);
    const [strings, ...values] = tx.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toMatch(/ORDER BY id\s+FOR UPDATE/);
    expect(values).toEqual([ORG, ABSORBED, TARGET]);
  });

  it('moves relations, drops the one between the two, keeps the stronger origin', async () => {
    pages();
    tx.knowledgeEdge.findMany
      .mockResolvedValueOnce([
        {
          fromPageId: 2,
          toPageId: 1,
          kind: 'dotyczy',
          origin: 'EXTRACTED',
          confidence: null,
        },
        {
          fromPageId: 2,
          toPageId: 9,
          kind: 'wymaga',
          origin: 'EXTRACTED',
          confidence: null,
        },
        {
          fromPageId: 7,
          toPageId: 2,
          kind: 'opisuje',
          origin: 'INFERRED',
          confidence: 0.5,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 40,
          fromPageId: 1,
          toPageId: 9,
          kind: 'wymaga',
          origin: 'INFERRED',
        },
      ]);
    await mergeKnowledgePagesCommand(input);
    expect(tx.knowledgeEdge.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: 40 },
      data: { origin: 'EXTRACTED' },
    });
    expect(tx.knowledgeEdge.createMany.mock.calls[0][0].data).toEqual([
      {
        organizationId: ORG,
        fromPageId: 7,
        toPageId: 1,
        kind: 'opisuje',
        origin: 'INFERRED',
        confidence: 0.5,
      },
    ]);
    expect(tx.knowledgeEdge.deleteMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      OR: [{ fromPageId: 2 }, { toPageId: 2 }],
    });
  });

  it.each([
    [
      'an approved page',
      { absorbed: { status: 'APPROVED' } },
      'invalid-status',
    ],
    [
      'into a rejected page',
      { target: { status: 'REJECTED' } },
      'invalid-status',
    ],
    [
      'a published target',
      { target: { publishedAt: new Date() } },
      'published',
    ],
    [
      'a page changed since it was read',
      { absorbed: { updatedAt: new Date(0) } },
      'conflict',
    ],
    [
      'a hand-written page',
      { target: { content: '# Wdrożenie\n\nTekst.' } },
      'unmergeable',
    ],
  ])('refuses to merge %s, writing nothing', async (_, over, error) => {
    pages(over);
    await expect(mergeKnowledgePagesCommand(input)).resolves.toEqual({
      success: false,
      error,
    });
    expect(tx.knowledgePage.updateMany).not.toHaveBeenCalled();
    expect(tx.knowledgeDecision.createMany).not.toHaveBeenCalled();
    expect(reconcile.startFindingsReconcile).not.toHaveBeenCalled();
  });

  it('refuses a page merged into itself without asking the database', async () => {
    await expect(
      mergeKnowledgePagesCommand({ ...input, targetPublicId: ABSORBED }),
    ).resolves.toEqual({ success: false, error: 'unmergeable' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('answers not-found when either page is not this organization’s', async () => {
    pages();
    tx.$queryRaw.mockResolvedValue([{ id: 2 }]);
    await expect(mergeKnowledgePagesCommand(input)).resolves.toEqual({
      success: false,
      error: 'not-found',
    });
  });
});
