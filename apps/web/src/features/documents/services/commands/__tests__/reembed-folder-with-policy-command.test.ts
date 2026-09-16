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
    mockJobStart.mockResolvedValue(undefined);
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
    expect(mockJobStart).not.toHaveBeenCalled();
    expect(mockFileUpdateMany).not.toHaveBeenCalled();
  });

  it('does not call updateMany to bulk-write piiPolicy before workflows start', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile('file-1'),
      makeFile('file-2'),
    ]);

    await reembedFolderWithPolicyCommand('folder-1', 'org-1', PiiPolicy.STRICT);

    expect(mockFileUpdateMany).not.toHaveBeenCalled();
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

    expect(mockJobStart).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toEqual(['file-1', 'file-2']);
    expect(result.failed).toEqual([]);
    expect(result.total).toBe(2);
  });

  it('updates piiPolicy and resets statuses per-file only after the job starts', async () => {
    mockFileFindMany.mockResolvedValue([makeFile('file-1')]);

    await reembedFolderWithPolicyCommand('folder-1', 'org-1', PiiPolicy.STRICT);

    expect(mockFileUpdate).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: {
        piiPolicy: PiiPolicy.STRICT,
        embeddingStatus: EmbeddingStatus.NOT_STARTED,
        parsingStatus: ParsingStatus.NOT_STARTED,
        embeddingStartedAt: null,
        embeddingCompletedAt: null,
        embeddingFailedAt: null,
        workflowId: 'reembed-id-1',
      },
    });
  });

  /**
   * The order reversed, deliberately, and this test records what that costs.
   *
   * The policy is written *before* the job starts, because the ingest reads it
   * off the row — writing after was already a race and would now be a
   * certainty. The consequence is that a file whose job fails to start keeps
   * the new policy with a `NOT_STARTED` status: the operator's intent is
   * recorded and the file is visibly un-ingested, which is the honest pair.
   * The alternative — the old order — ran the ingest under a policy that might
   * never be persisted, and the masking that actually applies is the one that
   * matters.
   */
  /**
   * The run id is reserved on the row before the start, so a start that failed
   * leaves the file pointing at a run that does not exist and a later cancel
   * would look it up and find nothing.
   */
  it('releases the reserved run id when the job fails to start', async () => {
    mockFileFindMany.mockResolvedValue([makeFile('file-1')]);
    mockJobStart.mockRejectedValue(new Error('temporal down'));

    await reembedFolderWithPolicyCommand('folder-1', 'org-1', PiiPolicy.STRICT);

    // Conditional on this attempt's id: if a newer re-embed has already
    // claimed the row, that one owns it and must not be unhooked by this
    // failure.
    expect(mockFileUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'file-1',
        organizationId: 'org-1',
        workflowId: expect.stringMatching(/^reembed-/),
      },
      data: { workflowId: null },
    });
  });

  it('keeps the written policy when the job fails to start, with the file left un-ingested', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile('file-1'),
      makeFile('file-2'),
    ]);
    mockJobStart
      .mockRejectedValueOnce(new Error('temporal down'))
      .mockResolvedValueOnce(undefined);

    const result = await reembedFolderWithPolicyCommand(
      'folder-1',
      'org-1',
      PiiPolicy.STRICT,
    );

    // Both were written before either start was attempted.
    expect(mockFileUpdate).toHaveBeenCalledTimes(2);
    for (const id of ['file-1', 'file-2']) {
      expect(mockFileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id, organizationId: 'org-1' },
          data: expect.objectContaining({
            piiPolicy: PiiPolicy.STRICT,
            parsingStatus: 'NOT_STARTED',
            embeddingStatus: 'NOT_STARTED',
          }),
        }),
      );
    }

    // The caller still learns which one did not start, which is what makes
    // "un-ingested" actionable rather than silent.
    expect(result.failed).toEqual([
      expect.objectContaining({ fileId: 'file-1' }),
    ]);
    expect(result.succeeded).toEqual(['file-2']);
  });

  it('puts failed files in failed[] and continues processing remaining files', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile('file-1'),
      makeFile('file-2'),
    ]);
    mockJobStart
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

    /**
     * A null policy is not a different policy — it is no override, resolving
     * to the same TOXIC_ONLY fallback the readers apply. Treating it as
     * different re-embedded every file in the subfolder for no change in
     * outcome, and wrote an explicit override onto a folder that had none,
     * which is a policy tag back in the rail nobody aimed at.
     */
    it('recursive=true: skips a subfolder whose null policy already resolves to the target', async () => {
      mockFolderFindFirst.mockResolvedValue({ path: '/' });
      mockFolderFindMany.mockResolvedValue([
        { id: 'sub-1', piiPolicy: null, path: '/folder-1/' },
      ]);
      mockFileFindMany.mockResolvedValue([]);

      const result = await reembedFolderWithPolicyCommand(
        'folder-1',
        'org-1',
        PiiPolicy.TOXIC_ONLY,
        true,
      );

      expect(mockFolderUpdate).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(0);
    });

    /** But it does need an override when the target is not the fallback. */
    it('recursive=true: gives a null subfolder an override when the target differs', async () => {
      mockFolderFindFirst.mockResolvedValue({ path: '/' });
      mockFolderFindMany.mockResolvedValue([
        { id: 'sub-1', piiPolicy: null, path: '/folder-1/' },
      ]);
      mockFileFindMany.mockResolvedValue([]);

      await reembedFolderWithPolicyCommand(
        'folder-1',
        'org-1',
        PiiPolicy.STRICT,
        true,
      );

      expect(mockFolderUpdate).toHaveBeenCalledWith({
        where: { id: 'sub-1', organizationId: 'org-1' },
        data: { piiPolicy: PiiPolicy.STRICT },
      });
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
