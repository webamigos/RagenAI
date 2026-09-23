import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePage: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  knowledgePageSource: { findMany: vi.fn() },
  knowledgeFinding: { findMany: vi.fn(), count: vi.fn() },
  userFile: { findMany: vi.fn() },
  documentVersion: { findMany: vi.fn() },
  member: { findMany: vi.fn() },
  team: { findMany: vi.fn() },
  // Not tenant-scoped: the ledger names actors who may have left.
  user: { findMany: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { getKnowledgePagesQuery } =
  await import('../services/queries/get-knowledge-pages-query');
const { getKnowledgePageQuery } =
  await import('../services/queries/get-knowledge-page-query');
const { getKnowledgeFindingsQuery } =
  await import('../services/queries/get-knowledge-findings-query');

const ORG = 'org-1';
const PUBLIC_ID = '11111111-2222-4333-8444-555555555555';
const NOW = new Date('2026-09-23T10:00:00Z');

/**
 * Every `where` a mock was called with, to assert the organization scope —
 * except `user`, which has no organization: the ledger's actors are looked
 * up there by the ids its scoped rows named.
 */
function wheres() {
  const { user: _unscoped, ...scoped } = db;
  return Object.values(scoped).flatMap((model) =>
    Object.values(model).flatMap((fn) =>
      (fn as ReturnType<typeof vi.fn>).mock.calls.map(
        ([args]) => (args as { where?: Record<string, unknown> })?.where,
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(db)) {
    for (const fn of Object.values(model)) {
      (fn as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    }
  }
  db.knowledgePage.count.mockResolvedValue(0);
  db.knowledgeFinding.count.mockResolvedValue(0);
  db.knowledgePage.findFirst.mockResolvedValue(null);
});

describe('getKnowledgePagesQuery', () => {
  it('lists every page but the rejected ones by default, scoped', async () => {
    await getKnowledgePagesQuery(ORG, null);
    expect(db.knowledgePage.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      status: { not: 'REJECTED' },
    });
  });

  it('reads a later batch when asked, never the first again', async () => {
    await getKnowledgePagesQuery(ORG, null, 3);
    const call = db.knowledgePage.findMany.mock.calls[0][0];
    expect(call.skip).toBe(2 * call.take);
    expect(call.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
  });

  it('filters by one status when asked', async () => {
    await getKnowledgePagesQuery(ORG, 'REJECTED');
    expect(db.knowledgePage.findMany.mock.calls[0][0].where.status).toBe(
      'REJECTED',
    );
  });

  it('counts distinct documents and open findings per page', async () => {
    db.knowledgePage.findMany.mockResolvedValue([
      {
        id: 1,
        publicId: PUBLIC_ID,
        title: 'Urlop',
        type: 'POLICY',
        status: 'CANDIDATE',
        publishedAt: null,
        updatedAt: NOW,
        owner: { name: null, email: 'a@x.pl' },
        sources: [{ fileId: 'f1' }, { fileId: 'f1' }, { fileId: 'f2' }],
      },
    ]);
    db.knowledgePage.count.mockResolvedValue(7);
    db.knowledgeFinding.findMany.mockResolvedValue([
      { pageIds: [1, 2] },
      { pageIds: [1] },
      { pageIds: [3] },
    ]);
    const list = await getKnowledgePagesQuery(ORG, null);
    expect(list).toEqual({
      total: 7,
      items: [
        {
          publicId: PUBLIC_ID,
          title: 'Urlop',
          type: 'POLICY',
          status: 'CANDIDATE',
          ownerName: 'a@x.pl',
          documents: 2,
          openFindings: 2,
          published: false,
          updatedAt: NOW.toISOString(),
        },
      ],
    });
    expect(db.knowledgeFinding.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      status: 'OPEN',
      pageIds: { hasSome: [1] },
    });
  });
});

describe('getKnowledgePageQuery', () => {
  const page = {
    id: 1,
    publicId: PUBLIC_ID,
    title: 'Urlop',
    type: 'POLICY',
    status: 'APPROVED',
    content: '# Urlop',
    accessibleBy: ['team:t1', 'user:u-gone'],
    publishedAt: null,
    lastVerifiedAt: null,
    verifyEvery: null,
    updatedAt: NOW,
    owner: null,
    sources: [
      {
        id: 10,
        fileId: 'f-current',
        documentVersionId: 'v1',
        span: '§1',
        quote: 'q1',
        sourceDeletedAt: null,
      },
      {
        id: 11,
        fileId: 'f-moved',
        documentVersionId: 'v2',
        span: '§2',
        quote: 'q2',
        sourceDeletedAt: null,
      },
      {
        id: 12,
        fileId: 'f-gone',
        documentVersionId: 'v3',
        span: '—',
        quote: 'q3',
        sourceDeletedAt: null,
      },
      {
        id: 13,
        fileId: 'f-current',
        documentVersionId: 'v1',
        span: '§3',
        quote: 'q4',
        sourceDeletedAt: NOW,
      },
    ],
    edgesFrom: [
      {
        kind: 'dotyczy',
        origin: 'EXTRACTED',
        toPage: { publicId: 'p2', title: 'Kadry' },
      },
    ],
    edgesTo: [],
    decisions: [],
    supersededBy: null,
  };

  it('answers null for a malformed id without asking the database', async () => {
    await expect(getKnowledgePageQuery(ORG, "' or 1=1")).resolves.toBeNull();
    expect(db.knowledgePage.findFirst).not.toHaveBeenCalled();
  });

  it('answers null for a page of another organization', async () => {
    await expect(getKnowledgePageQuery(ORG, PUBLIC_ID)).resolves.toBeNull();
    expect(db.knowledgePage.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      publicId: PUBLIC_ID,
    });
  });

  it('reads each source’s state now, and scopes every lookup', async () => {
    db.knowledgePage.findFirst.mockResolvedValue(page);
    db.userFile.findMany.mockResolvedValue([
      // The copy column set, as ingest leaves it…
      {
        id: 'f-current',
        fileName: 'a.pdf',
        documentId: 'd-current',
        document: null,
      },
      // …and only the relation, as the e2e seed leaves it: still found.
      {
        id: 'f-moved',
        fileName: 'b.pdf',
        documentId: null,
        document: { id: 'd-moved' },
      },
    ]);
    db.documentVersion.findMany
      .mockResolvedValueOnce([
        { id: 'v1', versionNumber: 1 },
        { id: 'v2', versionNumber: 3 },
      ])
      .mockResolvedValueOnce([
        { id: 'v1', documentId: 'd-current' },
        { id: 'v2-new', documentId: 'd-moved' },
      ]);
    db.team.findMany.mockResolvedValue([{ id: 't1', name: 'HR' }]);

    const detail = await getKnowledgePageQuery(ORG, PUBLIC_ID);
    expect(
      detail!.sources.map((s) => [
        s.id,
        s.state,
        s.documentId,
        s.pinnedVersion,
      ]),
    ).toEqual([
      [10, 'current', 'd-current', 1],
      [11, 'newer-version', 'd-moved', 3],
      [12, 'deleted', null, null],
      // Marked deleted, even though its file row still exists.
      [13, 'deleted', null, 1],
    ]);
    expect(detail!.access).toEqual([
      { kind: 'team', id: 't1', name: 'HR' },
      { kind: 'user', id: 'u-gone', name: null },
    ]);
    expect(detail!.edges).toEqual([
      {
        direction: 'out',
        kind: 'dotyczy',
        origin: 'EXTRACTED',
        page: { publicId: 'p2', title: 'Kadry' },
      },
    ]);
    for (const where of wheres()) {
      expect(where?.organizationId).toBe(ORG);
    }
  });

  it('lists the ledger newest first, naming actors who have left', async () => {
    db.knowledgePage.findFirst.mockResolvedValue({
      ...page,
      ownerId: 'u-owner',
      decisions: [
        { action: 'APPROVE', actorId: 'u-admin', createdAt: NOW },
        { action: 'SET_OWNER', actorId: 'u-deleted', createdAt: NOW },
      ],
    });
    db.user.findMany.mockResolvedValue([
      { id: 'u-admin', name: '', email: 'admin@example.com' },
    ]);

    const detail = await getKnowledgePageQuery(ORG, PUBLIC_ID);
    const query = db.knowledgePage.findFirst.mock.calls[0][0];
    expect(query.select.decisions).toMatchObject({
      where: { organizationId: ORG },
      orderBy: { id: 'desc' },
    });
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['u-admin', 'u-deleted'] },
    });
    expect(detail!.decisions).toEqual([
      {
        action: 'APPROVE',
        actorName: 'admin@example.com',
        createdAt: NOW.toISOString(),
      },
      { action: 'SET_OWNER', actorName: null, createdAt: NOW.toISOString() },
    ]);
    expect(detail!.ownerId).toBe('u-owner');
    expect(detail!.principals).toEqual(page.accessibleBy);
  });
});

describe('getKnowledgeFindingsQuery', () => {
  it('lists one status, most severe first, and resolves what each names', async () => {
    db.knowledgeFinding.findMany.mockResolvedValue([
      {
        publicId: 'f-1',
        type: 'CONTRADICTION',
        severity: 'HIGH',
        status: 'OPEN',
        detectedAt: NOW,
        pageIds: [1, 99],
        fileId: null,
        detail: { pairs: [{ aSourceId: 10, bSourceId: 20, explanation: 'x' }] },
      },
      {
        publicId: 'f-2',
        type: 'EXTRACTION_FAILED',
        severity: 'MEDIUM',
        status: 'OPEN',
        detectedAt: NOW,
        pageIds: [],
        fileId: 'file-1',
        detail: { reason: 'the call failed (TypeError)' },
      },
    ]);
    db.knowledgeFinding.count.mockResolvedValue(2);
    db.knowledgePage.findMany.mockResolvedValue([
      { id: 1, publicId: 'p1', title: 'Urlop' },
    ]);
    db.knowledgePageSource.findMany.mockResolvedValue([{ id: 10, quote: 'A' }]);
    db.userFile.findMany.mockResolvedValue([
      {
        id: 'file-1',
        fileName: 'r.pdf',
        documentId: null,
        document: { id: 'd1' },
      },
    ]);

    const list = await getKnowledgeFindingsQuery(ORG, 'OPEN');
    const call = db.knowledgeFinding.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: ORG, status: 'OPEN' });
    // `id` last: an offset over a tied order would repeat or skip rows.
    expect(call.orderBy).toEqual([
      { severity: 'desc' },
      { detectedAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(call.skip).toBe(0);
    // Page 99 no longer exists and is left out; the missing quote is null.
    expect(list.items[0]).toMatchObject({
      pages: [{ publicId: 'p1', title: 'Urlop' }],
      summary: {
        kind: 'contradiction',
        pairs: [{ a: 'A', b: null, explanation: 'x' }],
      },
    });
    expect(list.items[1]).toMatchObject({
      file: { name: 'r.pdf', documentId: 'd1' },
      summary: {
        kind: 'extraction_failed',
        reason: 'the call failed (TypeError)',
      },
    });
    expect(list.total).toBe(2);
    for (const where of wheres()) {
      expect(where?.organizationId).toBe(ORG);
    }
  });

  it('asks nothing else when there are no findings', async () => {
    const list = await getKnowledgeFindingsQuery(ORG, 'DISMISSED');
    expect(list).toEqual({ items: [], total: 0 });
    expect(db.knowledgePage.findMany).not.toHaveBeenCalled();
  });
});
