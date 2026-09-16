import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockUpdate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

const mockJobStart = vi.fn();
vi.mock('@/libs/jobs', () => ({
  jobs: () => ({ start: (...args: unknown[]) => mockJobStart(...args) }),
}));

vi.mock('@/features/documents/contracts/document.types', () => ({
  Workflow: { RUN_FILE_EMBEDDINGS: 'runFileEmbeddings' },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-nano-id',
}));

import { reembedFileCommand } from '../reembed-file-command';

function makeFileRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    organizationId: 'org-1',
    fileName: 'report.pdf',
    fileSize: 12345,
    fileType: 'PDF',
    metadata: null,
    documentId: null,
    projectId: 'proj-1',
    isUploaded: true,
    uploadedAt: new Date('2024-01-01T10:00:00Z'),
    parsingStatus: 'COMPLETED',
    parsingStartedAt: new Date('2024-01-01T10:00:01Z'),
    parsingCompletedAt: new Date('2024-01-01T10:00:05Z'),
    parsingFailedAt: null,
    embeddingStatus: 'COMPLETED',
    embeddingStartedAt: new Date('2024-01-01T10:00:06Z'),
    embeddingCompletedAt: new Date('2024-01-01T10:00:10Z'),
    embeddingFailedAt: null,
    piiPolicy: 'STRICT',
    isBinaryFile: true,
    fileExtension: 'pdf',
    fileMimeType: 'application/pdf',
    thumbnailS3Key: null,
    folderId: null,
    ownerId: null,
    pageCount: 5,
    ...overrides,
  };
}

describe('reembedFileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobStart.mockResolvedValue(undefined);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUpdate.mockResolvedValue(undefined);
  });

  // Without this the new run records no status at all on a file whose previous
  // ingest was cancelled: CANCELLED is sticky in the worker's status writers,
  // with no exception, and clearing it is the producer's job because only a
  // producer knows a new run is starting. Order matters — after the start, the
  // worker could already have written STARTED and this would erase it.
  it('clears the previous run status before starting the new run', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());

    await reembedFileCommand('file-1', 'org-1');

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: {
        parsingStatus: 'NOT_STARTED',
        embeddingStatus: 'NOT_STARTED',
      },
    });
    expect(mockUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockJobStart.mock.invocationCallOrder[0],
    );
  });

  it('starts the Temporal workflow and returns workflowId on success', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());

    const result = await reembedFileCommand('file-1', 'org-1');

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
    });
    expect(mockJobStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      'reembed-test-nano-id',
      { fileId: 'file-1', orgId: 'org-1' },
    );
    expect(result).toEqual({ workflowId: 'reembed-test-nano-id' });
  });

  it('throws when file is not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(reembedFileCommand('missing-file', 'org-1')).rejects.toThrow(
      'File not found: missing-file',
    );

    expect(mockJobStart).not.toHaveBeenCalled();
  });

  /**
   * The payload is two identifiers now, so there is nothing left to get wrong
   * about its shape — which is what the three tests replaced here asserted: a
   * `piiPolicy` copied from the row, and nine `Date` columns converted to ISO
   * strings because `client.workflow.start` took `args: unknown[]` and the
   * serializer did it silently.
   *
   * What replaces them is the property that made the copy unnecessary: the
   * ingest reads the row, so the row is the only thing that has to be right.
   */
  it('sends identifiers rather than a copy of the row', async () => {
    mockFindFirst.mockResolvedValue(
      makeFileRecord({
        piiPolicy: 'NONE',
        uploadedAt: new Date('2024-03-15T08:30:00Z'),
      }),
    );

    await reembedFileCommand('file-1', 'org-1');

    const payload = mockJobStart.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).toEqual({ fileId: 'file-1', orgId: 'org-1' });
    // No row fields rode along: a stale copy of any of these is what the
    // handler reading the row exists to prevent.
    expect(payload).not.toHaveProperty('piiPolicy');
    expect(payload).not.toHaveProperty('uploadedAt');
    expect(payload).not.toHaveProperty('fileName');
  });

  it('re-throws workflow start errors', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());
    mockJobStart.mockRejectedValue(new Error('temporal unavailable'));

    await expect(reembedFileCommand('file-1', 'org-1')).rejects.toThrow(
      'temporal unavailable',
    );
  });
});
