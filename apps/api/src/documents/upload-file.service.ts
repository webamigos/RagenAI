import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { StorageUsageService } from '../organizations/storage-usage.service.js';
import { FoldersService } from './folders.service.js';
import { S3StorageService } from '../storage/s3-storage.service.js';
import { TemporalClientService } from '../temporal/temporal-client.service.js';
import { Workflow } from '../temporal/temporal.consts.js';
import { parseFile } from './parse-file.js';
import { PiiPolicy, type UserFile } from '../generated/prisma/client.js';

/**
 * Reason an upload was rejected. The controller translates these into
 * HTTP status codes.
 */
export type UploadRejectionReason =
  | 'single_file_limit'
  | 'org_storage_limit'
  | 'project_storage_limit'
  | 's3_upload_failed'
  | 'workflow_start_failed';

export class UploadRejectedError extends Error {
  constructor(
    public readonly reason: UploadRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

export type UploadFileParams = {
  file: Express.Multer.File;
  organizationId: string;
  organizationSlug: string | null;
  projectId: string | null;
  userId?: string | null;
  userEmail?: string | null;
  folderId?: string | null;
  piiPolicy?: PiiPolicy | null;
};

export type UploadFileResult = {
  fileRecord: UserFile;
  workflowId: string;
};

/**
 * Ported from apps/web's
 * src/features/documents/services/commands/upload-file-command.ts
 * (`uploadFileCommand`), folded together with the small
 * `create-file-command.ts` it called. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Runs the full ingest pipeline for a single file:
 *   1. Enforce per-file / per-org / per-project storage limits
 *   2. Parse + type-detect (`parse-file.ts`)
 *   3. Create the `UserFile` row
 *   4. Upload raw bytes to S3 (rolls back the DB row on failure)
 *   5. Mark `isUploaded: true`
 *   6. Start the `runFileEmbeddings` Temporal workflow
 *
 * Throws `UploadRejectedError` on expected rejections (limits, S3/
 * workflow failure). Unexpected failures bubble up unchanged.
 *
 * Deviation: the original also accepts a pre-fetched `runningUsage` for
 * the UI's multi-file upload loop — apps/api's `/v1/files` is
 * single-file only, so that optimization isn't needed here. Workflow ids
 * use `node:crypto`'s `randomUUID()` instead of the original's `nanoid`
 * — nanoid v5 ships ESM-only with no CJS build at all (unlike
 * `@qdrant/js-client-rest`/`meilisearch`, which do and so get the
 * `require()` interop workaround instead), so it can't be added as a
 * dependency under this project's `nodenext` resolution without an async
 * dynamic `import()`; a random UUID serves the same "unique workflow id"
 * purpose.
 */
@Injectable()
export class UploadFileService {
  private readonly logger = new Logger(UploadFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly storageUsage: StorageUsageService,
    private readonly folders: FoldersService,
    private readonly auditLog: AuditLogService,
    private readonly s3: S3StorageService,
    private readonly temporal: TemporalClientService,
  ) {}

  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    const {
      file,
      organizationId,
      organizationSlug,
      projectId,
      userId,
      userEmail,
      folderId = null,
      piiPolicy,
    } = params;

    const [limits, orgUsage, projectUsageResult] = await Promise.all([
      this.organizationSettings.getStorageLimits(organizationId),
      this.storageUsage.getStorageUsage(organizationId),
      projectId
        ? this.storageUsage.getProjectStorageUsage(organizationId, projectId)
        : Promise.resolve(null),
    ]);

    if (file.size > limits.singleFileLimitBytes) {
      throw new UploadRejectedError(
        'single_file_limit',
        `File exceeds per-file limit of ${limits.singleFileLimitBytes} bytes`,
      );
    }
    if (orgUsage.totalBytes + file.size > limits.storageLimitBytes) {
      throw new UploadRejectedError(
        'org_storage_limit',
        `Organization storage limit of ${limits.storageLimitBytes} bytes would be exceeded`,
      );
    }
    if (
      projectId &&
      (projectUsageResult?.totalBytes ?? 0) + file.size >
        limits.projectStorageLimitBytes
    ) {
      throw new UploadRejectedError(
        'project_storage_limit',
        `Project storage limit of ${limits.projectStorageLimitBytes} bytes would be exceeded`,
      );
    }

    const parsed = parseFile(file);

    const fileRecord = await this.prisma.client.userFile.create({
      data: {
        organizationId,
        fileName: parsed.fileName,
        fileSize: file.size,
        fileType: parsed.fileType,
        projectId,
        folderId,
        ownerId: userId ?? null,
        fileExtension: parsed.fileExtension ?? null,
        fileMimeType: file.mimetype || null,
        ...(piiPolicy ? { piiPolicy } : {}),
      },
    });

    this.auditLog.track({
      orgId: organizationId,
      userId,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: fileRecord.id,
      newData: {
        fileName: parsed.fileName,
        fileSize: file.size,
        fileType: parsed.fileType,
      },
    });

    // S3 key: only append the extension if we actually detected one —
    // parseFile can return an undefined extension for a filename without
    // one, and we don't want "file-<id>.undefined" objects in the bucket.
    const s3Key = parsed.fileExtension
      ? `${fileRecord.id}.${parsed.fileExtension}`
      : fileRecord.id;

    try {
      await this.s3.upload(
        `${organizationId}/${s3Key}`,
        parsed.content as Buffer,
      );
    } catch (s3Err) {
      await this.prisma.client.userFile
        .delete({ where: { id: fileRecord.id } })
        .catch(() => undefined);
      const detail = s3Err instanceof Error ? s3Err.message : String(s3Err);
      this.logger.error('S3 upload failed, rolled back DB row', {
        err: s3Err,
        fileId: fileRecord.id,
        detail,
      });
      throw new UploadRejectedError(
        's3_upload_failed',
        `Failed to store file: ${detail}`,
      );
    }

    const updatedRecord = await this.prisma.client.userFile.update({
      where: { id: fileRecord.id, organizationId },
      data: { isUploaded: true, uploadedAt: new Date() },
    });

    let resolvedPiiPolicy: PiiPolicy = PiiPolicy.TOXIC_ONLY;
    if (piiPolicy) {
      resolvedPiiPolicy = piiPolicy;
    } else if (folderId) {
      resolvedPiiPolicy = await this.folders.getFolderPiiPolicy(
        folderId,
        organizationId,
      );
    }

    const workflowId = `doc-${randomUUID()}`;
    try {
      await this.temporal.startWorkflow(
        Workflow.RUN_FILE_EMBEDDINGS,
        workflowId,
        [
          {
            ...updatedRecord,
            projectId,
            organizationSlug: organizationSlug ?? undefined,
            organizationId,
            userEmail: userEmail ?? undefined,
            userId: userId ?? undefined,
            requestId: workflowId,
            piiPolicy: resolvedPiiPolicy,
          },
        ],
      );
    } catch (wfErr) {
      // The file is already in S3 and the DB. We intentionally don't
      // roll back — the caller can retry embedding separately — but we
      // surface the failure so it can be reported.
      this.logger.error('Failed to start embeddings workflow', {
        err: wfErr,
        fileId: updatedRecord.id,
      });
      throw new UploadRejectedError(
        'workflow_start_failed',
        'File stored but embedding workflow failed to start',
      );
    }

    return { fileRecord: updatedRecord, workflowId };
  }
}
