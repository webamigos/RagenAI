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
import { type TemporalClientService } from '../temporal/temporal-client.service.js';
import { Workflow } from '../temporal/temporal.consts.js';

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
  let create: jest.Mock;
  let update: jest.Mock;
  let deleteMock: jest.Mock;
  let organizationSettings: { getStorageLimits: jest.Mock };
  let storageUsage: {
    getStorageUsage: jest.Mock;
    getProjectStorageUsage: jest.Mock;
  };
  let folders: { getFolderPiiPolicy: jest.Mock };
  let auditLog: { track: jest.Mock };
  let s3: { upload: jest.Mock; delete: jest.Mock };
  let temporal: { startWorkflow: jest.Mock };
  let service: UploadFileService;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({ id: 'file-1' });
    update = jest.fn().mockResolvedValue({
      id: 'file-1',
      fileName: 'report.pdf',
      isUploaded: true,
    });
    deleteMock = jest.fn().mockResolvedValue(undefined);

    const prisma = {
      client: {
        userFile: { create, update, delete: deleteMock },
      },
    } as unknown as PrismaService;

    organizationSettings = {
      getStorageLimits: jest.fn().mockResolvedValue({
        singleFileLimitBytes: 5_000_000,
        storageLimitBytes: 50_000_000,
        projectStorageLimitBytes: 20_000_000,
      }),
    };
    storageUsage = {
      getStorageUsage: jest.fn().mockResolvedValue({ totalBytes: 0 }),
      getProjectStorageUsage: jest.fn().mockResolvedValue({ totalBytes: 0 }),
    };
    folders = { getFolderPiiPolicy: jest.fn().mockResolvedValue('TOXIC_ONLY') };
    auditLog = { track: jest.fn() };
    s3 = { upload: jest.fn().mockResolvedValue(undefined), delete: jest.fn() };
    temporal = { startWorkflow: jest.fn().mockResolvedValue(undefined) };

    service = new UploadFileService(
      prisma,
      organizationSettings as unknown as OrganizationSettingsService,
      storageUsage as unknown as StorageUsageService,
      folders as unknown as FoldersService,
      auditLog as unknown as AuditLogService,
      s3 as unknown as S3StorageService,
      temporal as unknown as TemporalClientService,
    );
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
      data: { isUploaded: true, uploadedAt: expect.any(Date) },
    });
    expect(temporal.startWorkflow).toHaveBeenCalledWith(
      Workflow.RUN_FILE_EMBEDDINGS,
      expect.stringMatching(/^doc-/),
      [
        expect.objectContaining({
          organizationId: 'org-1',
          projectId: 'proj-1',
        }),
      ],
    );
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
    temporal.startWorkflow.mockRejectedValue(new Error('temporal down'));

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
    expect(temporal.startWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [expect.objectContaining({ piiPolicy: 'STRICT' })],
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
    expect(temporal.startWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [expect.objectContaining({ piiPolicy: 'NONE' })],
    );
  });
});
