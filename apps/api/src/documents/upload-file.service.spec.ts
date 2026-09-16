import type { Mock } from 'vitest';
import {
  UploadFileService,
  UploadRejectedError,
} from './upload-file.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { type StorageUsageService } from '../organizations/storage-usage.service.js';
import { type FoldersService } from './folders.service.js';
import { type AuditLogService } from '../audit-logs/audit-log.service.js';
import { type S3StorageService } from '../storage/s3-storage.service.js';
import { type JobsService } from '../jobs/jobs.service.js';
import { type SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { Workflow } from '../jobs/jobs.consts.js';

function makeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'report.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 100,
    buffer: Buffer.from('%PDF-1.4'),
    ...overrides,
  } as Express.Multer.File;
}

describe('UploadFileService', () => {
  let create: Mock;
  let update: Mock;
  let deleteMock: Mock;
  let organizationSettings: { getStorageLimits: Mock };
  let storageUsage: {
    getStorageUsage: Mock;
    getProjectStorageUsage: Mock;
  };
  let folders: { getFolderPiiPolicy: Mock };
  let auditLog: { track: Mock };
  let s3: { upload: Mock; delete: Mock };
  let jobs: { start: Mock };
  let subscriptions: { isFeatureEnabled: Mock };
  let service: UploadFileService;

  beforeEach(() => {
    create = vi.fn().mockResolvedValue({ id: 'file-1' });
    update = vi.fn().mockResolvedValue({
      id: 'file-1',
      fileName: 'report.pdf',
      isUploaded: true,
    });
    deleteMock = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      client: {
        userFile: { create, update, delete: deleteMock },
      },
    } as unknown as PrismaService;

    organizationSettings = {
      getStorageLimits: vi.fn().mockResolvedValue({
        singleFileLimitBytes: 5_000_000,
        storageLimitBytes: 50_000_000,
        projectStorageLimitBytes: 20_000_000,
      }),
    };
    storageUsage = {
      getStorageUsage: vi.fn().mockResolvedValue({ totalBytes: 0 }),
      getProjectStorageUsage: vi.fn().mockResolvedValue({ totalBytes: 0 }),
    };
    folders = { getFolderPiiPolicy: vi.fn().mockResolvedValue('TOXIC_ONLY') };
    auditLog = { track: vi.fn() };
    s3 = { upload: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
    jobs = { start: vi.fn().mockResolvedValue(undefined) };
    // Uploading is gated on `manageDocuments`; these cases exercise the
    // pipeline, so the flag is on unless a test says otherwise.
    subscriptions = { isFeatureEnabled: vi.fn().mockResolvedValue(true) };

    service = new UploadFileService(
      prisma,
      organizationSettings as unknown as OrganizationSettingsService,
      storageUsage as unknown as StorageUsageService,
      folders as unknown as FoldersService,
      auditLog as unknown as AuditLogService,
      s3 as unknown as S3StorageService,
      jobs as unknown as JobsService,
      subscriptions as unknown as SubscriptionsService,
    );
  });

  it('refuses when the organization cannot manage documents', async () => {
    // The public `POST /v1/files` reaches this service, not apps/web's
    // uploadFileCommand, so the flag has to be checked here too (ADR-21).
    subscriptions.isFeatureEnabled.mockResolvedValue(false);

    await expect(
      service.uploadFile({
        file: makeFile(),
        organizationId: 'org-1',
        organizationSlug: 'acme',
        projectId: 'proj-1',
      }),
    ).rejects.toThrow('cannot add or remove documents');

    expect(s3.upload).not.toHaveBeenCalled();
    expect(jobs.start).not.toHaveBeenCalled();
  });

  it('uploads to S3 under an org-prefixed key and starts the embeddings workflow', async () => {
    const result = await service.uploadFile({
      file: makeFile(),
      organizationId: 'org-1',
      organizationSlug: 'acme',
      projectId: 'proj-1',
      userId: 'user-1',
    });

    expect(s3.upload).toHaveBeenCalledWith(
      'org-1/file-1.pdf',
      expect.any(Buffer),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: {
        isUploaded: true,
        uploadedAt: expect.any(Date),
        piiPolicy: 'TOXIC_ONLY',
      },
    });
    // Identifiers only: the ingest reads the row, so nothing about the file
    // rides along to go stale.
    expect(jobs.start).toHaveBeenCalledWith(
      Workflow.RUN_FILE_EMBEDDINGS,
      expect.stringMatching(/^doc-/),
      { fileId: 'file-1', orgId: 'org-1' },
    );

    // Restored: the splice that rewrote the payload assertion above took this
    // with it, and what the caller gets back is a separate promise from what
    // the job is started with.
    expect(result.fileRecord).toEqual({
      id: 'file-1',
      fileName: 'report.pdf',
      isUploaded: true,
    });

    expect(auditLog.track).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', action: 'document.uploaded' }),
    );
  });

  it('rejects files over the per-file limit before touching S3', async () => {
    organizationSettings.getStorageLimits.mockResolvedValue({
      singleFileLimitBytes: 10,
      storageLimitBytes: 50_000_000,
      projectStorageLimitBytes: 20_000_000,
    });

    await expect(
      service.uploadFile({
        file: makeFile({ size: 100 }),
        organizationId: 'org-1',
        organizationSlug: null,
        projectId: null,
      }),
    ).rejects.toMatchObject({ reason: 'single_file_limit' });
    expect(create).not.toHaveBeenCalled();
    expect(s3.upload).not.toHaveBeenCalled();
  });

  it('rejects when the org storage limit would be exceeded', async () => {
    storageUsage.getStorageUsage.mockResolvedValue({ totalBytes: 49_999_950 });

    await expect(
      service.uploadFile({
        file: makeFile({ size: 100 }),
        organizationId: 'org-1',
        organizationSlug: null,
        projectId: null,
      }),
    ).rejects.toMatchObject({ reason: 'org_storage_limit' });
  });

  it('rejects when the project storage limit would be exceeded', async () => {
    storageUsage.getProjectStorageUsage.mockResolvedValue({
      totalBytes: 19_999_950,
    });

    await expect(
      service.uploadFile({
        file: makeFile({ size: 100 }),
        organizationId: 'org-1',
        organizationSlug: null,
        projectId: 'proj-1',
      }),
    ).rejects.toMatchObject({ reason: 'project_storage_limit' });
  });

  it('rolls back the DB row when the S3 upload fails', async () => {
    s3.upload.mockRejectedValue(new Error('s3 down'));

    await expect(
      service.uploadFile({
        file: makeFile(),
        organizationId: 'org-1',
        organizationSlug: null,
        projectId: null,
      }),
    ).rejects.toBeInstanceOf(UploadRejectedError);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'file-1' } });
  });

  it('surfaces a workflow_start_failed error without rolling back the file', async () => {
    jobs.start.mockRejectedValue(new Error('temporal down'));

    await expect(
      service.uploadFile({
        file: makeFile(),
        organizationId: 'org-1',
        organizationSlug: null,
        projectId: null,
      }),
    ).rejects.toMatchObject({ reason: 'workflow_start_failed' });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('resolves PII policy from the folder when the file is uploaded into one and no explicit policy is given', async () => {
    folders.getFolderPiiPolicy.mockResolvedValue('STRICT');

    await service.uploadFile({
      file: makeFile(),
      organizationId: 'org-1',
      organizationSlug: null,
      projectId: null,
      folderId: 'folder-1',
    });

    expect(folders.getFolderPiiPolicy).toHaveBeenCalledWith(
      'folder-1',
      'org-1',
    );
    // Written to the row, which is what the ingest reads. It used to reach the
    // job as a payload field and was never persisted — so this is the case
    // that was actually broken: a STRICT folder masked as TOXIC_ONLY.
    expect(update).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: expect.objectContaining({ piiPolicy: 'STRICT' }),
    });
    // And before the job starts, since that is what the job will read.
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      jobs.start.mock.invocationCallOrder[0],
    );
  });

  it('prefers an explicit piiPolicy over the folder default', async () => {
    await service.uploadFile({
      file: makeFile(),
      organizationId: 'org-1',
      organizationSlug: null,
      projectId: null,
      folderId: 'folder-1',
      piiPolicy: 'NONE',
    });

    expect(folders.getFolderPiiPolicy).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: expect.objectContaining({ piiPolicy: 'NONE' }),
    });
  });
});
