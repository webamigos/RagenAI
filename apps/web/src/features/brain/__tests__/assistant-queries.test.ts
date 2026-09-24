import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn() },
  knowledgeDecision: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { searchKnowledgePagesQuery } =
  await import('../services/queries/search-knowledge-pages-query');
const { getKnowledgeDecisionsQuery } =
  await import('../services/queries/get-knowledge-decisions-query');
const { windowAround, SOURCE_SPAN_WINDOW } =
  await import('../services/queries/get-source-span-query');

beforeEach(() => vi.clearAllMocks());

describe('searchKnowledgePagesQuery', () => {
  it('searches inside the organization, rejected pages left out, titles first', async () => {
    const at = new Date(0);
    db.knowledgePage.findMany.mockResolvedValue([
      {
        publicId: 'a',
        title: 'Travel',
        type: 'POLICY',
        status: 'APPROVED',
        content: 'leave is…',
        updatedAt: at,
      },
      {
        publicId: 'b',
        title: 'Leave policy',
        type: 'POLICY',
        status: 'CANDIDATE',
        content: 'x',
        updatedAt: at,
      },
    ]);
    const hits = await searchKnowledgePagesQuery('org-1', 'leave');
    expect(db.knowledgePage.findMany.mock.calls[0]![0].where).toMatchObject({
      organizationId: 'org-1',
      status: { not: 'REJECTED' },
    });
    expect(hits.map((h) => h.publicId)).toEqual(['b', 'a']);
  });

  it('does not search on a single character', async () => {
    expect(await searchKnowledgePagesQuery('org-1', 'a')).toEqual([]);
    expect(db.knowledgePage.findMany).not.toHaveBeenCalled();
  });
});

describe('getKnowledgeDecisionsQuery', () => {
  it('reads the ledger since a date inside the organization, naming actors who have left', async () => {
    db.knowledgeDecision.findMany.mockResolvedValue([
      {
        action: 'APPROVE',
        actorId: 'gone',
        createdAt: new Date(0),
        page: { publicId: 'p', title: 'Leave' },
      },
    ]);
    db.user.findMany.mockResolvedValue([]);
    const since = new Date('2026-09-18T00:00:00Z');
    const rows = await getKnowledgeDecisionsQuery('org-1', since, 500);
    expect(db.knowledgeDecision.findMany.mock.calls[0]![0]).toMatchObject({
      where: { organizationId: 'org-1', createdAt: { gte: since } },
      take: 100,
    });
    expect(rows).toEqual([
      {
        action: 'APPROVE',
        actorName: null,
        createdAt: new Date(0).toISOString(),
        page: { publicId: 'p', title: 'Leave' },
      },
    ]);
  });
});

describe('windowAround', () => {
  it('returns the quote with a bounded window either side', () => {
    const text = `${'a'.repeat(2000)} the quoted words ${'b'.repeat(2000)}`;
    const window = windowAround(text, 'the  quoted\nwords')!;
    expect(window).toContain('the quoted words');
    expect(window.length).toBeLessThanOrEqual(
      SOURCE_SPAN_WINDOW * 2 + 'the quoted words'.length + 4,
    );
    expect(window.startsWith('…')).toBe(true);
  });

  it('answers null when the quote is not in the text', () => {
    expect(windowAround('something else', 'missing')).toBeNull();
  });
});
