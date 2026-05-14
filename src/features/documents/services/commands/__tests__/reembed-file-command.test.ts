import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

const mockWorkflowStart = vi.fn();
vi.mock('@/libs/temporal', () => ({
  getTemporalClient: () => ({
    workflow: { start: (...args: unknown[]) => mockWorkflowStart(...args) },
  }),
  TASK_QUEUE_NAME: 'ragen-tasks',
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
    mockWorkflowStart.mockResolvedValue(undefined);
  });

  it('starts the Temporal workflow and returns workflowId on success', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());

    const result = await reembedFileCommand('file-1', 'org-1');

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
    });
    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        taskQueue: 'ragen-tasks',
        workflowId: 'reembed-test-nano-id',
      }),
    );
    expect(result).toEqual({ workflowId: 'reembed-test-nano-id' });
  });

  it('throws when file is not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(reembedFileCommand('missing-file', 'org-1')).rejects.toThrow(
      'File not found: missing-file',
    );

    expect(mockWorkflowStart).not.toHaveBeenCalled();
  });

  it('passes piiPolicy from the DB record to workflow args', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord({ piiPolicy: 'NONE' }));

    await reembedFileCommand('file-1', 'org-1');

    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        args: [expect.objectContaining({ piiPolicy: 'NONE' })],
      }),
    );
  });

  it('converts Date fields to ISO strings in workflow args', async () => {
    const uploadedAt = new Date('2024-03-15T08:30:00Z');
    const embeddingCompletedAt = new Date('2024-03-15T08:31:00Z');
    mockFindFirst.mockResolvedValue(
      makeFileRecord({ uploadedAt, embeddingCompletedAt }),
    );

    await reembedFileCommand('file-1', 'org-1');

    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        args: [
          expect.objectContaining({
            uploadedAt: '2024-03-15T08:30:00.000Z',
            embeddingCompletedAt: '2024-03-15T08:31:00.000Z',
          }),
        ],
      }),
    );
  });

  it('passes requestId equal to the workflowId in workflow args', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());

    await reembedFileCommand('file-1', 'org-1');

    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        args: [
          expect.objectContaining({
            requestId: 'reembed-test-nano-id',
          }),
        ],
      }),
    );
  });

  it('re-throws workflow start errors', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());
    mockWorkflowStart.mockRejectedValue(new Error('temporal unavailable'));

    await expect(reembedFileCommand('file-1', 'org-1')).rejects.toThrow(
      'temporal unavailable',
    );
  });
});
