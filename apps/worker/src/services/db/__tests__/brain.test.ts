import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  knowledgePage: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  knowledgePageSource: { createMany: vi.fn() },
  knowledgeEdge: { createMany: vi.fn() },
  knowledgeFinding: { updateMany: vi.fn() },
}));
const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  knowledgeFinding: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  userFile: { findFirst: vi.fn() },
  documentVersion: { findFirst: vi.fn() },
}));

vi.mock('../prisma.js', () => ({ getPrisma: () => prisma }));

import {
  getExtractionSource,
  recordExtractionFailed,
  replaceCandidatesFromFile,
  resolveExtractionFailed,
} from '../brain.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const page = (slug: string) => ({
  slug,
  title: slug,
  type: 'PROCESS' as const,
  content: `# ${slug}`,
  contentHash: HASH,
  accessibleBy: ['team:hr'],
  sources: [
    {
      fileId: 'file-1',
      documentVersionId: 'v-1',
      span: '§2',
      quote: 'a quote long enough',
      hash: HASH,
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  tx.knowledgePage.deleteMany.mockResolvedValue({ count: 0 });
  tx.knowledgePage.findMany.mockResolvedValue([]);
  let id = 100;
  tx.knowledgePage.create.mockImplementation(async () => ({ id: id++ }));
});

describe('replaceCandidatesFromFile', () => {
  it('replaces only untouched candidates that cite this file alone', async () => {
    await replaceCandidatesFromFile({
      orgId: 'org-1',
      fileId: 'file-1',
      pages: [page('a')],
      edges: [],
    });
    expect(tx.knowledgePage.findMany.mock.calls[0]![0]).toEqual({
      where: {
        organizationId: 'org-1',
        status: 'CANDIDATE',
        sources: { some: { fileId: 'file-1' }, every: { fileId: 'file-1' } },
        decisions: { none: {} },
      },
      select: { id: true },
    });
    // Nothing to replace: no delete, and no findings touched.
    expect(tx.knowledgePage.deleteMany).not.toHaveBeenCalled();
    expect(tx.knowledgeFinding.updateMany).not.toHaveBeenCalled();
  });

  // A contradiction naming a page that is about to be deleted is one nobody
  // can act on; the fresh candidate is judged again by this run.
  it('deletes the replaced pages by id and resolves the findings naming them', async () => {
    tx.knowledgePage.findMany.mockResolvedValueOnce([{ id: 7 }, { id: 8 }]);
    tx.knowledgePage.deleteMany.mockResolvedValueOnce({ count: 2 });
    const written = await replaceCandidatesFromFile({
      orgId: 'org-1',
      fileId: 'file-1',
      pages: [page('a')],
      edges: [],
    });
    expect(tx.knowledgePage.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: [7, 8] } },
    });
    expect(tx.knowledgeFinding.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        status: 'OPEN',
        pageIds: { hasSome: [7, 8] },
      },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
    });
    expect(written.pagesReplaced).toBe(2);
  });

  it('writes every row with its organization', async () => {
    await replaceCandidatesFromFile({
      orgId: 'org-1',
      fileId: 'file-1',
      pages: [page('a'), page('b')],
      edges: [
        { fromSlug: 'a', toSlug: 'b', kind: 'uses', origin: 'EXTRACTED' },
      ],
    });
    for (const [args] of tx.knowledgePage.create.mock.calls) {
      expect(args.data.organizationId).toBe('org-1');
      expect(args.data.status).toBeUndefined(); // the schema default: CANDIDATE
    }
    for (const [args] of tx.knowledgePageSource.createMany.mock.calls) {
      for (const row of args.data) {
        expect(row).toMatchObject({
          organizationId: 'org-1',
          quote: 'a quote long enough',
        });
      }
    }
    expect(tx.knowledgeEdge.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          fromPageId: 100,
          toPageId: 101,
          kind: 'uses',
          origin: 'EXTRACTED',
        },
      ],
      skipDuplicates: true,
    });
  });

  // A page someone has worked on stays; the fresh candidate sits beside it.
  it('suffixes a slug that is still taken after the replacement', async () => {
    tx.knowledgePage.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ slug: 'a' }])
      .mockResolvedValueOnce([{ slug: 'a-2' }]);
    await replaceCandidatesFromFile({
      orgId: 'org-1',
      fileId: 'file-1',
      pages: [page('a')],
      edges: [],
    });
    expect(tx.knowledgePage.create.mock.calls[0]![0].data.slug).toBe('a-3');
  });

  it('does all of it in one transaction', async () => {
    await replaceCandidatesFromFile({
      orgId: 'org-1',
      fileId: 'file-1',
      pages: [page('a')],
      edges: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('the EXTRACTION_FAILED finding', () => {
  const detail = { reason: 'r', windowIndex: 0, runId: 'run-1' };

  it('is created once, with the file as its subject and no page', async () => {
    prisma.knowledgeFinding.findFirst.mockResolvedValue(null);
    await recordExtractionFailed({ orgId: 'org-1', fileId: 'file-1', detail });
    expect(prisma.knowledgeFinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        type: 'EXTRACTION_FAILED',
        fileId: 'file-1',
        pageIds: [],
      }),
    });
  });

  it('is refreshed, not duplicated, by a second failure', async () => {
    prisma.knowledgeFinding.findFirst.mockResolvedValue({ id: 7 });
    await recordExtractionFailed({ orgId: 'org-1', fileId: 'file-1', detail });
    expect(prisma.knowledgeFinding.create).not.toHaveBeenCalled();
    expect(prisma.knowledgeFinding.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: 7 },
      data: expect.objectContaining({ detail }),
    });
  });

  it('is resolved within the organization only', async () => {
    prisma.knowledgeFinding.updateMany.mockResolvedValue({ count: 1 });
    await resolveExtractionFailed({ orgId: 'org-1', fileId: 'file-1' });
    expect(prisma.knowledgeFinding.updateMany.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      type: 'EXTRACTION_FAILED',
      fileId: 'file-1',
      status: 'OPEN',
    });
  });
});

describe('getExtractionSource', () => {
  it('reads the active version, scoped to the organization', async () => {
    prisma.userFile.findFirst.mockResolvedValue({
      fileName: 'a.pdf',
      documentId: 'doc-1',
      language: 'pol',
    });
    prisma.documentVersion.findFirst.mockResolvedValue({
      id: 'v-1',
      content: 'text',
    });
    expect(await getExtractionSource('file-1', 'org-1')).toEqual({
      fileName: 'a.pdf',
      language: 'pol',
      documentVersionId: 'v-1',
      text: 'text',
    });
    expect(prisma.userFile.findFirst.mock.calls[0]![0].where).toEqual({
      id: 'file-1',
      organizationId: 'org-1',
    });
    expect(prisma.documentVersion.findFirst.mock.calls[0]![0].where).toEqual({
      organizationId: 'org-1',
      documentId: 'doc-1',
      isActive: true,
    });
  });

  it('finds the document through the relation when the copy column is empty', async () => {
    prisma.userFile.findFirst.mockResolvedValue({
      fileName: 'a.pdf',
      documentId: null,
      language: null,
      document: { id: 'doc-rel' },
    });
    prisma.documentVersion.findFirst.mockResolvedValue({
      id: 'v-1',
      content: 'text',
    });
    await getExtractionSource('file-1', 'org-1');
    expect(
      prisma.documentVersion.findFirst.mock.calls[0]![0].where.documentId,
    ).toBe('doc-rel');
  });

  it('answers null for a file that was never parsed', async () => {
    prisma.userFile.findFirst.mockResolvedValue({
      fileName: 'a.pdf',
      documentId: null,
    });
    expect(await getExtractionSource('file-1', 'org-1')).toBeNull();
  });
});
