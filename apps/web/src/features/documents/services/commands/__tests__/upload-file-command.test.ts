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

const mockJobStart = vi.fn();
vi.mock('@/libs/jobs', () => ({
  jobs: () => ({ start: (...args: unknown[]) => mockJobStart(...args) }),
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

// The write-restriction gates resolve flags from the database. These files
// test what happens *after* the gate allows the operation; the gate's own
// behaviour is covered in feature-guards.test.ts and in the per-command
// refusal cases.
vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageDocuments: vi.fn(),
  assertCanManageProjects: vi.fn(),
  assertCanManageOrganizationSettings: vi.fn(),
}));

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
    mockJobStart.mockResolvedValue(undefined);
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
    expect(mockJobStart).toHaveBeenCalledWith(
      'runFileEmbeddings',
      expect.stringMatching(/^doc-/),
      { fileId: 'file-1', orgId: 'org-1' },
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
    mockJobStart.mockRejectedValue(new Error('temporal down'));

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

  /**
   * The policy is written to the **row** now, not sent in the payload, because
   * the ingest reads the row. That move is the reason these three assert a
   * database write rather than a job argument — and the folder case below is
   * the one that was actually broken: it was resolved into the payload and
   * never persisted, so a file uploaded into a STRICT folder would have been
   * masked as TOXIC_ONLY the moment the ingest started reading the row.
   */
  type UpdateCall = { data: Record<string, unknown> };

  /**
   * The call that carries the policy, found by content rather than position:
   * a second `update` writes `workflowId` after the job starts, so `at(-1)` is
   * the wrong one and picking by index would quietly pass the day a third
   * write appears.
   */
  const policyWrittenToRow = (): UpdateCall =>
    (mockUserFileUpdate.mock.calls as [UpdateCall][])
      .map(([call]) => call)
      .find((call) => 'piiPolicy' in call.data)!;

  it('writes an explicit policy to the row, and does not ask the folder', async () => {
    await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'o',
      projectId: null,
      piiPolicy: PiiPolicy.STRICT,
    });

    expect(policyWrittenToRow().data.piiPolicy).toBe('STRICT');
    expect(mockGetFolderPiiPolicy).not.toHaveBeenCalled();
  });

  it('writes TOXIC_ONLY when nothing says otherwise', async () => {
    await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'o',
      projectId: null,
    });

    expect(policyWrittenToRow().data.piiPolicy).toBe('TOXIC_ONLY');
    expect(mockGetFolderPiiPolicy).not.toHaveBeenCalled();
  });

  it('writes the folder’s policy to the row, before the job starts', async () => {
    mockGetFolderPiiPolicy.mockResolvedValue('NONE');

    await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'o',
      projectId: null,
      folderId: 'folder-1',
    });

    expect(mockGetFolderPiiPolicy).toHaveBeenCalledWith('folder-1', 'org-1');
    expect(policyWrittenToRow().data.piiPolicy).toBe('NONE');
    // Order is the property, not a detail: the ingest reads this row, so a
    // job that started first would mask under whatever the row said before.
    expect(mockUserFileUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockJobStart.mock.invocationCallOrder[0],
    );
  });

  it('starts the job with identifiers only', async () => {
    await uploadFileCommand({
      file: makeFile(100),
      organizationId: 'org-1',
      organizationSlug: 'o',
      projectId: null,
    });

    const payload = mockJobStart.mock.calls[0][2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['fileId', 'orgId']);
  });
});
