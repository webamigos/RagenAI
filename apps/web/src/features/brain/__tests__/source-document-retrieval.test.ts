import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFile: { findFirst: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  knowledgePageSource: { findFirst: vi.fn(), groupBy: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const vectors = vi.hoisted(() => ({ deleteFileFromVectorStore: vi.fn() }));
vi.mock('@/app/api/upload/services/TableService', () => vectors);
const audit = vi.hoisted(() => ({ trackAudit: vi.fn() }));
vi.mock(
  '@/features/audit-logs/services/commands/create-audit-log-command',
  () => audit,
);
const reembed = vi.hoisted(() => ({ reembedFileCommand: vi.fn() }));
vi.mock(
  '@/features/documents/services/commands/reembed-file-command',
  () => reembed,
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { withdrawSourceDocumentCommand, restoreSourceDocumentCommand } =
  await import('../services/commands/source-document-retrieval-commands');
const { getBrainDocumentsQuery } =
  await import('../services/queries/get-brain-documents-query');

const ORG = 'org-1';
const input = { orgId: ORG, fileId: 'f1' };

beforeEach(() => {
  vi.clearAllMocks();
  vectors.deleteFileFromVectorStore.mockResolvedValue(undefined);
  reembed.reembedFileCommand.mockResolvedValue({ workflowId: 'w' });
});

describe('withdrawSourceDocumentCommand', () => {
  it('deletes the chunks, then marks the file WITHDRAWN — in that order', async () => {
    db.userFile.findFirst.mockResolvedValue({
      id: 'f1',
      embeddingStatus: 'COMPLETED',
    });
    db.knowledgePageSource.findFirst.mockResolvedValue({ id: 1 });
    await expect(withdrawSourceDocumentCommand(input)).resolves.toEqual({
      success: true,
    });
    expect(db.userFile.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      id: 'f1',
      publishedPages: { none: {} },
    });
    expect(db.knowledgePageSource.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      fileId: 'f1',
      page: { status: 'APPROVED' },
    });
    expect(vectors.deleteFileFromVectorStore).toHaveBeenCalledWith('f1', ORG);
    expect(db.userFile.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: 'f1' },
      data: { embeddingStatus: 'WITHDRAWN' },
    });
    expect(
      vectors.deleteFileFromVectorStore.mock.invocationCallOrder[0],
    ).toBeLessThan(db.userFile.updateMany.mock.invocationCallOrder[0]!);
  });

  it('refuses a document no approved page cites yet', async () => {
    db.userFile.findFirst.mockResolvedValue({
      id: 'f1',
      embeddingStatus: 'COMPLETED',
    });
    db.knowledgePageSource.findFirst.mockResolvedValue(null);
    await expect(withdrawSourceDocumentCommand(input)).resolves.toEqual({
      success: false,
      error: 'not-curated',
    });
    expect(vectors.deleteFileFromVectorStore).not.toHaveBeenCalled();
  });

  it('leaves the document searchable and saying so when the index refuses', async () => {
    db.userFile.findFirst.mockResolvedValue({
      id: 'f1',
      embeddingStatus: 'COMPLETED',
    });
    db.knowledgePageSource.findFirst.mockResolvedValue({ id: 1 });
    vectors.deleteFileFromVectorStore.mockRejectedValue(new Error('down'));
    await expect(withdrawSourceDocumentCommand(input)).resolves.toEqual({
      success: false,
      error: 'index-unavailable',
    });
    expect(db.userFile.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a document that is not in retrieval', async () => {
    db.userFile.findFirst.mockResolvedValue({
      id: 'f1',
      embeddingStatus: 'STARTED',
    });
    await expect(withdrawSourceDocumentCommand(input)).resolves.toEqual({
      success: false,
      error: 'invalid-status',
    });
  });
});

describe('restoreSourceDocumentCommand', () => {
  it('re-runs ingest for a withdrawn document', async () => {
    db.userFile.findFirst.mockResolvedValue({
      id: 'f1',
      embeddingStatus: 'WITHDRAWN',
    });
    await expect(restoreSourceDocumentCommand(input)).resolves.toEqual({
      success: true,
    });
    expect(reembed.reembedFileCommand).toHaveBeenCalledWith('f1', ORG);
  });

  it('only restores what was withdrawn', async () => {
    db.userFile.findFirst.mockResolvedValue({
      id: 'f1',
      embeddingStatus: 'COMPLETED',
    });
    await expect(restoreSourceDocumentCommand(input)).resolves.toEqual({
      success: false,
      error: 'invalid-status',
    });
    expect(reembed.reembedFileCommand).not.toHaveBeenCalled();
  });

  it('puts a document back to WITHDRAWN when its ingest could not start, so restoring again works', async () => {
    db.userFile.findFirst.mockResolvedValue({
      id: 'f1',
      embeddingStatus: 'WITHDRAWN',
    });
    reembed.reembedFileCommand.mockRejectedValue(new Error('redis down'));
    await expect(restoreSourceDocumentCommand(input)).resolves.toEqual({
      success: false,
      error: 'failed-to-start',
    });
    expect(db.userFile.updateMany).toHaveBeenCalledWith({
      // Only if no run has claimed the file since the reset.
      where: { organizationId: ORG, id: 'f1', embeddingStatus: 'NOT_STARTED' },
      data: { embeddingStatus: 'WITHDRAWN' },
    });
  });
});

describe('getBrainDocumentsQuery', () => {
  it('counts approved and candidate pages per document and reads its retrieval state', async () => {
    db.userFile.findMany.mockResolvedValue([
      { id: 'f1', fileName: 'a.pdf', embeddingStatus: 'COMPLETED' },
      { id: 'f2', fileName: 'b.pdf', embeddingStatus: 'WITHDRAWN' },
    ]);
    db.knowledgePageSource.groupBy
      .mockResolvedValueOnce([{ fileId: 'f1', _count: { pageId: 2 } }])
      .mockResolvedValueOnce([{ fileId: 'f2', _count: { pageId: 1 } }]);
    await expect(getBrainDocumentsQuery(ORG)).resolves.toEqual([
      {
        fileId: 'f1',
        fileName: 'a.pdf',
        approvedPages: 2,
        candidatePages: 0,
        retrieval: 'in',
      },
      {
        fileId: 'f2',
        fileName: 'b.pdf',
        approvedPages: 0,
        candidatePages: 1,
        retrieval: 'withdrawn',
      },
    ]);
  });
});
