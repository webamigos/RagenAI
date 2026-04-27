import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import type { UserFile } from '@/generated/prisma/client';
import { PiiPolicy } from '@/generated/prisma/client';
import { createFileCommand } from './create-file-command';
import { getFileType, parseFile } from '@/app/lib/services/fileParser';
import { uploadToS3WithOrg } from '@/app/lib/services/storage';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { getStorageLimits } from '@/features/organizations/services/organization-settings';
import {
  getStorageUsageQuery,
  getProjectStorageUsageQuery,
} from '@/features/organizations/services/queries/get-storage-usage-query';
import { logger } from '@/app/lib/utils/logger';
import { getFolderPiiPolicyQuery } from '@/features/documents/services/queries/get-folder-pii-policy-query';

/**
 * Reason an upload was rejected. Callers translate these into HTTP
 * status codes (the UI route returns per-file failure entries; the
 * internal v1 route returns a single-file 413 or 5xx).
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
  file: File;
  organizationId: string;
  organizationSlug: string | null;
  projectId: string | null;
  userId?: string | null;
  userEmail?: string | null;
  folderId?: string | null;
  piiPolicy?: PiiPolicy | null;
  /**
   * Pre-fetched usage totals to avoid an extra round-trip when the
   * caller is looping over multiple files. If omitted the command
   * fetches its own. Supply running totals that include previously
   * accepted files in the same batch.
   */
  runningUsage?: {
    orgBytes: number;
    projectBytes: number;
  };
};

export type UploadFileResult = {
  fileRecord: UserFile;
  workflowId: string;
  bytesUsed: number;
};

/**
 * Run the full ingest pipeline for a single file:
 *   1. Enforce per-file / per-org / per-project storage limits
 *   2. Parse + type-detect
 *   3. Create the `UserFile` row
 *   4. Upload raw bytes to S3 (rolls back the DB row on failure)
 *   5. Mark `isUploaded: true`
 *   6. Start the `runFileEmbeddings` Temporal workflow
 *
 * Throws `UploadRejectedError` on expected rejections (limits, S3
 * failure). Unexpected failures bubble up unchanged.
 *
 * Used by:
 *  - `/api/upload`  — multi-file UI upload (loops, collects per-file
 *    failures)
 *  - `/api/v1/files` — single-file internal upload used by ragen-api's
 *    OpenAI-compatible `POST /v1/files`
 */
export async function uploadFileCommand(
  params: UploadFileParams,
): Promise<UploadFileResult> {
  const {
    file,
    organizationId,
    organizationSlug,
    projectId,
    userId,
    userEmail,
    folderId = null,
    piiPolicy,
    runningUsage,
  } = params;

  const orgUsagePromise = runningUsage
    ? Promise.resolve({ totalBytes: runningUsage.orgBytes })
    : getStorageUsageQuery(organizationId);

  let projectUsagePromise: Promise<{ totalBytes: number } | null>;
  if (runningUsage) {
    projectUsagePromise = Promise.resolve({
      totalBytes: runningUsage.projectBytes,
    });
  } else if (projectId) {
    projectUsagePromise = getProjectStorageUsageQuery(
      organizationId,
      projectId,
    );
  } else {
    projectUsagePromise = Promise.resolve(null);
  }

  const [limits, orgUsage, projectUsageResult] = await Promise.all([
    getStorageLimits(organizationId),
    orgUsagePromise,
    projectUsagePromise,
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

  const parsed = await parseFile(file, organizationId);
  const fileType = getFileType(parsed.fileName);

  const fileRecord = await createFileCommand(
    parsed.fileName,
    file.size,
    organizationId,
    fileType,
    projectId,
    {
      folderId,
      ownerId: userId ?? null,
      fileExtension: parsed.fileExtension ?? null,
      fileMimeType: file.type || null,
      piiPolicy: piiPolicy ?? null,
    },
  );

  // S3 key: only append the extension if we actually detected one.
  // parseFile may return a null extension for content without a known
  // type (e.g. uploaded via stream without a filename), and we don't
  // want "file-<id>.null" objects in the bucket.
  const s3Key = parsed.fileExtension
    ? `${fileRecord.id}.${parsed.fileExtension}`
    : fileRecord.id;

  try {
    // Use the *WithOrg variant because this command can run outside a
    // Better Auth session (called from internal ragen-api → ragen-app
    // proxy routes where there is no request-scoped session to read
    // the org from).
    await uploadToS3WithOrg(organizationId, s3Key, parsed.content as Buffer);
  } catch (s3Err) {
    // Roll back the DB row so we don't leave orphaned isUploaded:false
    // rows behind on S3 failures.
    await db.userFile
      .delete({ where: { id: fileRecord.id } })
      .catch(() => undefined);
    const detail = s3Err instanceof Error ? s3Err.message : String(s3Err);
    logger.error(
      { err: s3Err, fileId: fileRecord.id, detail },
      'S3 upload failed, rolled back DB row',
    );
    throw new UploadRejectedError(
      's3_upload_failed',
      `Failed to store file: ${detail}`,
    );
  }

  const updatedRecord = await db.userFile.update({
    where: { id: fileRecord.id, organizationId },
    data: { isUploaded: true, uploadedAt: new Date() },
  });

  let resolvedPiiPolicy: PiiPolicy = PiiPolicy.TOXIC_ONLY;
  if (piiPolicy) {
    resolvedPiiPolicy = piiPolicy;
  } else if (folderId) {
    resolvedPiiPolicy = await getFolderPiiPolicyQuery(folderId, organizationId);
  }

  const workflowId = `doc-${nanoid()}`;
  try {
    const client = getTemporalClient();
    await client.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
      taskQueue: TASK_QUEUE_NAME,
      workflowId,
      args: [
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
    });
  } catch (wfErr) {
    // The file is already in S3 and the DB. We intentionally don't
    // roll back — the user can retry embedding separately — but we
    // surface the failure so the caller can report it.
    logger.error(
      { err: wfErr, fileId: updatedRecord.id },
      'Failed to start embeddings workflow',
    );
    throw new UploadRejectedError(
      'workflow_start_failed',
      'File stored but embedding workflow failed to start',
    );
  }

  return {
    fileRecord: updatedRecord,
    workflowId,
    bytesUsed: file.size,
  };
}
