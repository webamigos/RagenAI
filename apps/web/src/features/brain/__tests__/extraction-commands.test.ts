import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFile: { findMany: vi.fn() },
  knowledgeFinding: { findFirst: vi.fn() },
  knowledgePageSource: { groupBy: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
const runtime = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('@/libs/jobs', () => ({ jobs: () => runtime }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { startBrainExtractionCommand, retryExtractionFindingCommand } =
  await import('../services/commands/start-brain-extraction-command');
const { getExtractableDocumentsQuery, extractableFilesWhere } =
  await import('../services/queries/get-extractable-documents-query');

const ORG = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.start.mockResolvedValue(undefined);
});

describe('extractableFilesWhere', () => {
  it('is scoped, excludes imports and published pages’ files, needs a document', () => {
    expect(extractableFilesWhere(ORG)).toEqual({
      organizationId: ORG,
      sourceFileId: null,
      publishedPages: { none: {} },
      OR: [{ document: { isNot: null } }, { documentId: { not: null } }],
    });
  });
});

describe('startBrainExtractionCommand', () => {
  it('starts one run over the ids that survive the organization filter', async () => {
    db.userFile.findMany.mockResolvedValue([{ id: 'f1' }]);
    await expect(
      startBrainExtractionCommand({
        orgId: ORG,
        userId: 'u1',
        fileIds: ['f1', 'f-other-org', 'f1'],
      }),
    ).resolves.toEqual({ success: true, documents: 1 });
    expect(db.userFile.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      id: { in: ['f1', 'f-other-org'] },
    });
    const [job, runId, payload] = runtime.start.mock.calls[0];
    expect(job).toBe('brainExtract');
    expect(runId).toMatch(/^brain-extract-/);
    expect(payload).toEqual({ orgId: ORG, fileIds: ['f1'], userId: 'u1' });
  });

  it('starts nothing when no file is extractable here', async () => {
    db.userFile.findMany.mockResolvedValue([]);
    await expect(
      startBrainExtractionCommand({ orgId: ORG, userId: 'u1', fileIds: ['x'] }),
    ).resolves.toEqual({ success: false, error: 'no-documents' });
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it('says the run did not start when the queue refuses it', async () => {
    db.userFile.findMany.mockResolvedValue([{ id: 'f1' }]);
    runtime.start.mockRejectedValue(new Error('redis down'));
    await expect(
      startBrainExtractionCommand({
        orgId: ORG,
        userId: 'u1',
        fileIds: ['f1'],
      }),
    ).resolves.toEqual({ success: false, error: 'failed-to-start' });
  });
});

describe('retryExtractionFindingCommand', () => {
  it('retries the file an open EXTRACTION_FAILED finding names', async () => {
    db.knowledgeFinding.findFirst.mockResolvedValue({ fileId: 'f1' });
    db.userFile.findMany.mockResolvedValue([{ id: 'f1' }]);
    await retryExtractionFindingCommand({
      orgId: ORG,
      userId: 'u1',
      findingPublicId: 'p',
    });
    expect(db.knowledgeFinding.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      publicId: 'p',
      type: 'EXTRACTION_FAILED',
      status: 'OPEN',
    });
    expect(runtime.start.mock.calls[0][2].fileIds).toEqual(['f1']);
  });

  it('answers not-found for a closed or foreign finding', async () => {
    db.knowledgeFinding.findFirst.mockResolvedValue(null);
    await expect(
      retryExtractionFindingCommand({
        orgId: ORG,
        userId: 'u1',
        findingPublicId: 'p',
      }),
    ).resolves.toEqual({ success: false, error: 'not-found' });
    expect(runtime.start).not.toHaveBeenCalled();
  });
});

describe('getExtractableDocumentsQuery', () => {
  it('counts the live pages citing each document', async () => {
    db.userFile.findMany.mockResolvedValue([
      { id: 'f1', fileName: 'a.pdf' },
      { id: 'f2', fileName: 'b.pdf' },
    ]);
    db.knowledgePageSource.groupBy.mockResolvedValue([
      { fileId: 'f1', _count: { pageId: 3 } },
    ]);
    await expect(getExtractableDocumentsQuery(ORG)).resolves.toEqual([
      { fileId: 'f1', fileName: 'a.pdf', pages: 3 },
      { fileId: 'f2', fileName: 'b.pdf', pages: 0 },
    ]);
    expect(db.knowledgePageSource.groupBy.mock.calls[0][0].where).toMatchObject(
      {
        organizationId: ORG,
        page: { status: { not: 'REJECTED' } },
      },
    );
  });
});
