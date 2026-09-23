import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  knowledgeFinding: { createMany: vi.fn(), updateMany: vi.fn() },
}));
const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  knowledgePage: { findMany: vi.fn() },
  knowledgeEdge: { findMany: vi.fn() },
  knowledgePageSource: { findMany: vi.fn() },
  knowledgeFinding: { findMany: vi.fn() },
  member: { findMany: vi.fn() },
  userFile: { findMany: vi.fn() },
  documentVersion: { findMany: vi.fn() },
}));

vi.mock('../prisma.js', () => ({ getPrisma: () => prisma }));

import {
  applyFindingsPlan,
  loadComputedFindings,
  loadFindingsSnapshot,
} from '../brain-findings.js';

const APPROVED_AT = new Date('2026-09-01T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  prisma.knowledgePage.findMany.mockResolvedValue([
    {
      id: 1,
      type: 'POLICY',
      status: 'APPROVED',
      ownerId: 'u1',
      verifyEvery: null,
      lastVerifiedAt: null,
      publishedAt: null,
      decisions: [{ createdAt: APPROVED_AT }],
    },
  ]);
  prisma.knowledgeEdge.findMany.mockResolvedValue([]);
  prisma.knowledgePageSource.findMany.mockResolvedValue([
    {
      id: 10,
      pageId: 1,
      fileId: 'f-same',
      documentVersionId: 'v1',
      quote: 'q',
      sourceDeletedAt: null,
    },
    {
      id: 11,
      pageId: 1,
      fileId: 'f-moved',
      documentVersionId: 'v2',
      quote: 'q',
      sourceDeletedAt: null,
    },
    {
      id: 12,
      pageId: 1,
      fileId: 'f-gone',
      documentVersionId: 'v3',
      quote: 'q',
      sourceDeletedAt: null,
    },
  ]);
  prisma.member.findMany.mockResolvedValue([{ userId: 'u1' }]);
  prisma.userFile.findMany.mockResolvedValue([
    { id: 'f-same', documentId: 'd-same' },
    { id: 'f-moved', documentId: 'd-moved' },
  ]);
  prisma.documentVersion.findMany
    .mockResolvedValueOnce([
      { id: 'v1', documentId: 'd-same' },
      { id: 'v2-new', documentId: 'd-moved' },
    ])
    .mockResolvedValueOnce([{ id: 'v2-new', content: 'the new text' }]);
});

describe('loadFindingsSnapshot', () => {
  it('scopes every read to the organization', async () => {
    await loadFindingsSnapshot('org-1');
    for (const read of [
      prisma.knowledgePage.findMany,
      prisma.knowledgeEdge.findMany,
      prisma.knowledgePageSource.findMany,
      prisma.member.findMany,
      prisma.userFile.findMany,
      prisma.documentVersion.findMany,
    ]) {
      for (const [args] of read.mock.calls) {
        expect(args.where.organizationId).toBe('org-1');
      }
    }
  });

  it('leaves rejected pages out and reads sources of curated pages only', async () => {
    await loadFindingsSnapshot('org-1');
    expect(prisma.knowledgePage.findMany.mock.calls[0][0].where.status).toEqual(
      { not: 'REJECTED' },
    );
    expect(
      prisma.knowledgePageSource.findMany.mock.calls[0][0].where.page,
    ).toEqual({ status: { in: ['APPROVED', 'STALE'] } });
  });

  // The expensive read, and the reason the loader is shaped as it is.
  it('reads document text only for a version that moved past its pin', async () => {
    const snapshot = await loadFindingsSnapshot('org-1');
    expect(prisma.documentVersion.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.documentVersion.findMany.mock.calls[1][0].where.id).toEqual({
      in: ['v2-new'],
    });
    expect(snapshot.files.get('f-same')).toEqual({
      activeVersionId: 'v1',
      activeText: null,
    });
    expect(snapshot.files.get('f-moved')).toEqual({
      activeVersionId: 'v2-new',
      activeText: 'the new text',
    });
    // A file with no row is absent, which the rule reads as deleted.
    expect(snapshot.files.has('f-gone')).toBe(false);
  });

  it('reads no text at all when nothing moved', async () => {
    prisma.userFile.findMany.mockResolvedValue([
      { id: 'f-same', documentId: 'd-same' },
    ]);
    prisma.documentVersion.findMany.mockReset();
    prisma.documentVersion.findMany.mockResolvedValue([
      { id: 'v1', documentId: 'd-same' },
    ]);
    await loadFindingsSnapshot('org-1');
    expect(prisma.documentVersion.findMany).toHaveBeenCalledTimes(1);
  });

  it('carries the latest approval as the verification base, and the members', async () => {
    const snapshot = await loadFindingsSnapshot('org-1');
    expect(snapshot.pages[0]).toMatchObject({ id: 1, approvedAt: APPROVED_AT });
    expect(snapshot.pages[0]).not.toHaveProperty('decisions');
    expect([...snapshot.members]).toEqual(['u1']);
  });
});

describe('loadComputedFindings', () => {
  it('reads the four computed types, in every status', async () => {
    prisma.knowledgeFinding.findMany.mockResolvedValue([]);
    await loadComputedFindings('org-1');
    expect(prisma.knowledgeFinding.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      type: { in: ['GAP', 'ORPHAN', 'STALE', 'UNOWNED'] },
    });
  });
});

describe('applyFindingsPlan', () => {
  const finding = {
    type: 'ORPHAN' as const,
    pageIds: [1] as [number],
    fileId: null,
    severity: 'LOW' as const,
    detail: { rule: 'no_links' as const, fingerprint: 'no_links' },
  };

  beforeEach(() => {
    tx.knowledgeFinding.createMany.mockResolvedValue({ count: 1 });
    tx.knowledgeFinding.updateMany.mockResolvedValue({ count: 1 });
  });

  it('writes nothing for an empty plan', async () => {
    await expect(
      applyFindingsPlan('org-1', { create: [], update: [], resolve: [] }),
    ).resolves.toEqual({ created: 0, updated: 0, resolved: 0 });
    expect(tx.knowledgeFinding.createMany).not.toHaveBeenCalled();
    expect(tx.knowledgeFinding.updateMany).not.toHaveBeenCalled();
  });

  it('creates, updates and resolves in one transaction', async () => {
    const result = await applyFindingsPlan('org-1', {
      create: [finding],
      update: [{ id: 5, finding }],
      resolve: [6, 7],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 1, resolved: 1 });
    expect(tx.knowledgeFinding.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          type: 'ORPHAN',
          severity: 'LOW',
          pageIds: [1],
          fileId: null,
          detail: finding.detail,
        },
      ],
    });
  });

  // A dismissal made between the read and the write has the last word.
  it('touches only rows that are still open', async () => {
    await applyFindingsPlan('org-1', {
      create: [],
      update: [{ id: 5, finding }],
      resolve: [6],
    });
    const wheres = tx.knowledgeFinding.updateMany.mock.calls.map(
      ([args]) => args.where,
    );
    expect(wheres).toEqual([
      { organizationId: 'org-1', id: 5, status: 'OPEN' },
      { organizationId: 'org-1', id: { in: [6] }, status: 'OPEN' },
    ]);
  });
});
