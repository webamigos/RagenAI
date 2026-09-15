import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
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
      expect.objectContaining({ id: 'file-1' }),
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

  it('passes piiPolicy from the DB record into the payload', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord({ piiPolicy: 'NONE' }));

    await reembedFileCommand('file-1', 'org-1');

    expect(mockJobStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.any(String),
      expect.objectContaining({ piiPolicy: 'NONE' }),
    );
  });

  it('converts Date fields to ISO strings in the payload', async () => {
    const uploadedAt = new Date('2024-03-15T08:30:00Z');
    const embeddingCompletedAt = new Date('2024-03-15T08:31:00Z');
    mockFindFirst.mockResolvedValue(
      makeFileRecord({ uploadedAt, embeddingCompletedAt }),
    );

    await reembedFileCommand('file-1', 'org-1');

    expect(mockJobStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.any(String),
      expect.objectContaining({
        uploadedAt: '2024-03-15T08:30:00.000Z',
        embeddingCompletedAt: '2024-03-15T08:31:00.000Z',
      }),
    );
  });

  it('passes requestId equal to the run id in the payload', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());

    await reembedFileCommand('file-1', 'org-1');

    expect(mockJobStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.any(String),
      expect.objectContaining({ requestId: 'reembed-test-nano-id' }),
    );
  });

  it('re-throws workflow start errors', async () => {
    mockFindFirst.mockResolvedValue(makeFileRecord());
    mockJobStart.mockRejectedValue(new Error('temporal unavailable'));

    await expect(reembedFileCommand('file-1', 'org-1')).rejects.toThrow(
      'temporal unavailable',
    );
  });
});
