import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiiPolicy } from '@/generated/prisma/client';

const mockCreateFile = vi.fn();
vi.mock('../create-file-command', () => ({
  createFileCommand: (...args: unknown[]) => mockCreateFile(...args),
}));

const mockParseFile = vi.fn();
const mockGetFileType = vi.fn();
vi.mock('@/app/lib/services/fileParser', () => ({
  parseFile: (...args: unknown[]) => mockParseFile(...args),
  getFileType: (...args: unknown[]) => mockGetFileType(...args),
}));

const mockUploadToS3 = vi.fn();
vi.mock('@/app/lib/services/storage', () => ({
  uploadToS3WithOrg: (...args: unknown[]) => mockUploadToS3(...args),
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

const mockGetStorageLimits = vi.fn();
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getStorageLimits: (...args: unknown[]) => mockGetStorageLimits(...args),
}));

const mockUserFileUpdate = vi.fn();
const mockUserFileDelete = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      update: (...args: unknown[]) => mockUserFileUpdate(...args),
      delete: (...args: unknown[]) => mockUserFileDelete(...args),
    },
  },
}));

vi.mock(
  '@/features/organizations/services/queries/get-storage-usage-query',
  () => ({
    getStorageUsageQuery: vi.fn().mockResolvedValue({ totalBytes: 0 }),
    getProjectStorageUsageQuery: vi.fn().mockResolvedValue({ totalBytes: 0 }),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetFolderPiiPolicy = vi.fn();
vi.mock(
  '@/features/documents/services/queries/get-folder-pii-policy-query',
  () => ({
    getFolderPiiPolicyQuery: (...args: unknown[]) =>
      mockGetFolderPiiPolicy(...args),
  }),
);

import { uploadFileCommand, UploadRejectedError } from '../upload-file-command';

function makeFile(size: number, name = 'test.pdf') {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

describe('uploadFileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStorageLimits.mockResolvedValue({
      singleFileLimitBytes: 10_000_000,
      storageLimitBytes: 1_000_000_000,
      projectStorageLimitBytes: 500_000_000,
    });
    mockParseFile.mockResolvedValue({
      fileName: 'test.pdf',
      fileExtension: 'pdf',
      content: Buffer.from('pdf-bytes'),
    });
    mockGetFileType.mockReturnValue('PDF');
    mockCreateFile.mockResolvedValue({
      id: 'file-1',
      fileName: 'test.pdf',
      organizationId: 'org-1',
    });
    mockUserFileUpdate.mockResolvedValue({
      id: 'file-1',
      fileName: 'test.pdf',
      isUploaded: true,
      organizationId: 'org-1',
    });
    mockUploadToS3.mockResolvedValue(undefined);
    mockWorkflowStart.mockResolvedValue(undefined);
    mockUserFileDelete.mockResolvedValue(undefined);
  });

  it('runs DB → S3 → update → workflow for a single file', async () => {
    const result = await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'org-slug',
      projectId: 'proj-1',
      userId: 'user-1',
    });

    expect(mockCreateFile).toHaveBeenCalled();
    expect(mockUploadToS3).toHaveBeenCalledWith(
      'org-1',
      'file-1.pdf',
      expect.anything(),
    );
    expect(mockUserFileUpdate).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: expect.objectContaining({ isUploaded: true }),
    });
    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        taskQueue: 'ragen-tasks',
        workflowId: expect.stringMatching(/^doc-/),
      }),
    );
    expect(result).toMatchObject({
      fileRecord: expect.objectContaining({ id: 'file-1' }),
      bytesUsed: 100,
      workflowId: expect.stringMatching(/^doc-/),
    });
  });

  it('rejects files over the per-file limit', async () => {
    mockGetStorageLimits.mockResolvedValue({
      singleFileLimitBytes: 50,
      storageLimitBytes: 1_000_000,
      projectStorageLimitBytes: 1_000_000,
    });

    await expect(
      uploadFileCommand({
        file: makeFile(100),
        organizationId: 'org-1',
        organizationSlug: 'o',
        projectId: null,
      }),
    ).rejects.toMatchObject({
      name: 'UploadRejectedError',
      reason: 'single_file_limit',
    });
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  it('rejects when org total would be exceeded', async () => {
    mockGetStorageLimits.mockResolvedValue({
      singleFileLimitBytes: 1_000_000,
      storageLimitBytes: 100,
      projectStorageLimitBytes: 1_000_000,
    });

    await expect(
      uploadFileCommand({
        file: makeFile(50),
        organizationId: 'org-1',
        organizationSlug: 'o',
        projectId: null,
        runningUsage: { orgBytes: 80, projectBytes: 0 },
      }),
    ).rejects.toMatchObject({ reason: 'org_storage_limit' });
  });

  it('rejects when project total would be exceeded', async () => {
    mockGetStorageLimits.mockResolvedValue({
      singleFileLimitBytes: 1_000_000,
      storageLimitBytes: 1_000_000,
      projectStorageLimitBytes: 100,
    });

    await expect(
      uploadFileCommand({
        file: makeFile(50),
        organizationId: 'org-1',
        organizationSlug: 'o',
        projectId: 'proj-1',
        runningUsage: { orgBytes: 0, projectBytes: 80 },
      }),
    ).rejects.toMatchObject({ reason: 'project_storage_limit' });
  });

  it('rolls back the DB row if S3 upload fails', async () => {
    mockUploadToS3.mockRejectedValue(new Error('S3 down'));

    await expect(
      uploadFileCommand({
        file: makeFile(100),
        organizationId: 'org-1',
        organizationSlug: 'o',
        projectId: null,
      }),
    ).rejects.toBeInstanceOf(UploadRejectedError);

    expect(mockUserFileDelete).toHaveBeenCalledWith({
      where: { id: 'file-1' },
    });
  });

  it('surfaces workflow start failures (DB + S3 remain)', async () => {
    mockWorkflowStart.mockRejectedValue(new Error('temporal down'));

    await expect(
      uploadFileCommand({
        file: makeFile(100),
        organizationId: 'org-1',
        organizationSlug: 'o',
        projectId: null,
      }),
    ).rejects.toMatchObject({ reason: 'workflow_start_failed' });

    // DB is NOT rolled back in this case — the file is already in S3
    // and can be retried.
    expect(mockUserFileDelete).not.toHaveBeenCalled();
  });

  it('passes piiPolicy from params to workflow args', async () => {
    await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'o',
      projectId: null,
      piiPolicy: PiiPolicy.STRICT,
    });

    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        args: [expect.objectContaining({ piiPolicy: 'STRICT' })],
      }),
    );
    // Should not query folder when piiPolicy is explicitly provided
    expect(mockGetFolderPiiPolicy).not.toHaveBeenCalled();
  });

  it('defaults piiPolicy to TOXIC_ONLY when not provided and no folderId', async () => {
    await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'o',
      projectId: null,
    });

    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        args: [expect.objectContaining({ piiPolicy: 'TOXIC_ONLY' })],
      }),
    );
    expect(mockGetFolderPiiPolicy).not.toHaveBeenCalled();
  });

  it('inherits piiPolicy from folder when not explicitly set', async () => {
    mockGetFolderPiiPolicy.mockResolvedValue('NONE');

    await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'o',
      projectId: null,
      folderId: 'folder-1',
    });

    expect(mockGetFolderPiiPolicy).toHaveBeenCalledWith('folder-1', 'org-1');
    expect(mockWorkflowStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.objectContaining({
        args: [expect.objectContaining({ piiPolicy: 'NONE' })],
      }),
    );
  });
});
