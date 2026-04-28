import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PiiPolicy,
  EmbeddingStatus,
  ParsingStatus,
} from '@/generated/prisma/client';

const mockFolderUpdate = vi.fn();
const mockFolderFindMany = vi.fn();
const mockFolderFindFirst = vi.fn();
const mockFileFindMany = vi.fn();
const mockFileUpdateMany = vi.fn();
const mockFileUpdate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentFolder: {
      update: (...args: unknown[]) => mockFolderUpdate(...args),
      findMany: (...args: unknown[]) => mockFolderFindMany(...args),
      findFirst: (...args: unknown[]) => mockFolderFindFirst(...args),
    },
    userFile: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
      updateMany: (...args: unknown[]) => mockFileUpdateMany(...args),
      update: (...args: unknown[]) => mockFileUpdate(...args),
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

let nanoidCounter = 0;
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => `id-${++nanoidCounter}`),
}));

import { reembedFolderWithPolicyCommand } from '../reembed-folder-with-policy-command';

function makeFile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    organizationId: 'org-1',
    fileName: `${id}.pdf`,
    fileSize: 1000,
    fileType: 'PDF',
    metadata: null,
    documentId: null,
    projectId: null,
    isUploaded: true,
    uploadedAt: new Date('2024-01-01T10:00:00Z'),
    parsingStatus: 'COMPLETED',
    parsingStartedAt: null,
    parsingCompletedAt: null,
    parsingFailedAt: null,
    embeddingStatus: 'COMPLETED',
    embeddingStartedAt: null,
    embeddingCompletedAt: null,
    embeddingFailedAt: null,
    piiPolicy: 'TOXIC_ONLY',
    isBinaryFile: false,
    fileExtension: 'pdf',
    fileMimeType: 'application/pdf',
    thumbnailS3Key: null,
    folderId: 'folder-1',
    ownerId: null,
    pageCount: 1,
    ...overrides,
  };
}

describe('reembedFolderWithPolicyCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nanoidCounter = 0;
    mockFolderUpdate.mockResolvedValue({ id: 'folder-1', piiPolicy: 'STRICT' });
    mockFolderFindMany.mockResolvedValue([]);
    mockFolderFindFirst.mockResolvedValue(null);
    mockFileUpdateMany.mockResolvedValue({ count: 0 });
    mockFileUpdate.mockResolvedValue({});
    mockWorkflowStart.mockResolvedValue(undefined);
  });

  it('returns empty result when folder has no uploaded files', async () => {
    mockFileFindMany.mockResolvedValue([]);

    const result = await reembedFolderWithPolicyCommand(
      'folder-1',
      'org-1',
      PiiPolicy.STRICT,
    );

    expect(mockFolderUpdate).toHaveBeenCalledWith({
      where: { id: 'folder-1', organizationId: 'org-1' },
      data: { piiPolicy: PiiPolicy.STRICT },
    });
    expect(result).toEqual({ succeeded: [], failed: [], total: 0 });
    expect(mockWorkflowStart).not.toHaveBeenCalled();
    expect(mockFileUpdateMany).not.toHaveBeenCalled();
  });

  it('updates piiPolicy on all files in folder', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile('file-1'),
      makeFile('file-2'),
    ]);

    await reembedFolderWithPolicyCommand('folder-1', 'org-1', PiiPolicy.STRICT);

    expect(mockFileUpdateMany).toHaveBeenCalledWith({
      where: {
        folderId: 'folder-1',
        organizationId: 'org-1',
        isUploaded: true,
      },
      data: { piiPolicy: PiiPolicy.STRICT },
    });
  });

  it('starts workflow for each file and returns succeeded ids', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile('file-1'),
      makeFile('file-2'),
    ]);

    const result = await reembedFolderWithPolicyCommand(
      'folder-1',
      'org-1',
      PiiPolicy.STRICT,
    );

    expect(mockWorkflowStart).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toEqual(['file-1', 'file-2']);
    expect(result.failed).toEqual([]);
    expect(result.total).toBe(2);
  });

  it('resets embedding and parsing statuses for each file', async () => {
    mockFileFindMany.mockResolvedValue([makeFile('file-1')]);

    await reembedFolderWithPolicyCommand('folder-1', 'org-1', PiiPolicy.STRICT);

    expect(mockFileUpdate).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: {
        embeddingStatus: EmbeddingStatus.NOT_STARTED,
        parsingStatus: ParsingStatus.NOT_STARTED,
        embeddingStartedAt: null,
        embeddingCompletedAt: null,
        embeddingFailedAt: null,
      },
    });
  });

  it('puts failed files in failed[] and continues processing remaining files', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile('file-1'),
      makeFile('file-2'),
    ]);
    mockWorkflowStart
      .mockRejectedValueOnce(new Error('temporal down'))
      .mockResolvedValueOnce(undefined);

    const result = await reembedFolderWithPolicyCommand(
      'folder-1',
      'org-1',
      PiiPolicy.STRICT,
    );

    expect(result.failed).toEqual([
      {
        fileId: 'file-1',
        fileName: 'file-1.pdf',
        error: 'workflow_start_failed',
      },
    ]);
    expect(result.succeeded).toEqual(['file-2']);
    expect(result.total).toBe(2);
  });

  it('queries only isUploaded=true files', async () => {
    mockFileFindMany.mockResolvedValue([]);

    await reembedFolderWithPolicyCommand(
      'folder-1',
      'org-1',
      PiiPolicy.TOXIC_ONLY,
    );

    expect(mockFileFindMany).toHaveBeenCalledWith({
      where: {
        folderId: 'folder-1',
        organizationId: 'org-1',
        isUploaded: true,
      },
    });
  });

  describe('recursive: true', () => {
    it('recursive=false: does not query subfolders', async () => {
      mockFileFindMany.mockResolvedValue([]);

      await reembedFolderWithPolicyCommand(
        'folder-1',
        'org-1',
        PiiPolicy.STRICT,
        false,
      );

      expect(mockFolderFindMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ path: expect.anything() }),
        }),
      );
    });

    it('recursive=true: skips subfolders with identical policy', async () => {
      mockFolderFindFirst.mockResolvedValue({ path: '/' });
      mockFolderFindMany.mockResolvedValue([
        { id: 'sub-1', piiPolicy: 'STRICT', path: '/folder-1/' },
      ]);
      mockFileFindMany.mockResolvedValue([]);

      const result = await reembedFolderWithPolicyCommand(
        'folder-1',
        'org-1',
        PiiPolicy.STRICT,
        true,
      );

      // sub-1 already has STRICT — folder update should only run for main folder
      expect(mockFolderUpdate).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(0);
    });

    it('recursive=true: updates policy and reembeds files in subfolder with different policy', async () => {
      mockFolderFindFirst.mockResolvedValue({ path: '/' });
      mockFolderFindMany.mockResolvedValue([
        { id: 'sub-1', piiPolicy: 'NONE', path: '/folder-1/' },
      ]);
      mockFileFindMany
        .mockResolvedValueOnce([]) // main folder — no files
        .mockResolvedValueOnce([makeFile('sub-file-1', { folderId: 'sub-1' })]); // subfolder

      const result = await reembedFolderWithPolicyCommand(
        'folder-1',
        'org-1',
        PiiPolicy.STRICT,
        true,
      );

      expect(mockFolderUpdate).toHaveBeenCalledWith({
        where: { id: 'sub-1', organizationId: 'org-1' },
        data: { piiPolicy: PiiPolicy.STRICT },
      });
      expect(result.total).toBe(1);
      expect(result.succeeded).toEqual(['sub-file-1']);
    });

    it('recursive=true: total aggregates files from all folders', async () => {
      mockFolderFindFirst.mockResolvedValue({ path: '/' });
      mockFolderFindMany.mockResolvedValue([
        { id: 'sub-1', piiPolicy: 'NONE', path: '/folder-1/' },
      ]);
      mockFileFindMany
        .mockResolvedValueOnce([makeFile('main-file-1')])
        .mockResolvedValueOnce([makeFile('sub-file-1', { folderId: 'sub-1' })]);

      const result = await reembedFolderWithPolicyCommand(
        'folder-1',
        'org-1',
        PiiPolicy.STRICT,
        true,
      );

      expect(result.total).toBe(2);
      expect(result.succeeded).toContain('main-file-1');
      expect(result.succeeded).toContain('sub-file-1');
    });
  });
});
