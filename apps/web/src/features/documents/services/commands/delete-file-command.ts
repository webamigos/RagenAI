import db from '@ragenai/prisma-client';
import { deleteFromS3, deleteFromS3ByKey } from '@/app/lib/services/storage';
import { deleteFileFromVectorStore } from '@/app/api/upload/services/TableService';
import { getFileExtension } from '@/app/lib/utils/getFileExtension';
import { deleteDocumentFromDbCommand } from './update-document-command';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { logger } from '@/app/lib/utils/logger';

export type DeleteFileParams = {
  fileId: string;
  organizationId: string;
  /**
   * When provided, enforces project-scoped deletion — the file must
   * belong to this project, or the delete no-ops with `deleted: false`.
   * Omit for org-wide deletes (e.g. admin flows).
   */
  projectId?: string | null;
};

export type DeleteFileResult = {
  deleted: boolean;
  fileId: string;
  fileName: string | null;
};

/**
 * Full cleanup for a file: DB row + S3 object + S3 thumbnail + any
 * attached `UserDocument` + vector store entries. Collapses the three
 * previously-duplicated inline implementations (`deleteFileAction`,
 * `deleteProjectFileAction`, and the folder-delete loop) plus the
 * internal `/api/v1/files/[fileId]` route into one.
 *
 * External cleanup (S3, vectors, UserDocument) is best-effort — if
 * any step fails we log and keep going so a partial failure doesn't
 * leave the DB row orphaned. The DB delete is the atomic operation
 * that matters for consistency.
 */
export async function deleteFileCommand(
  params: DeleteFileParams,
): Promise<DeleteFileResult> {
  const { fileId, organizationId, projectId } = params;

  const fileRecord = await db.userFile.findFirst({
    where: {
      id: fileId,
      organizationId,
      ...(projectId !== undefined ? { projectId } : {}),
    },
  });

  if (!fileRecord) {
    return { deleted: false, fileId, fileName: null };
  }

  const { count } = await db.userFile.deleteMany({
    where: { id: fileRecord.id, organizationId },
  });

  if (count === 0) {
    return { deleted: false, fileId, fileName: fileRecord.fileName };
  }

  trackAudit({
    action: 'document.deleted',
    entityType: 'document',
    entityId: fileRecord.id,
  });

  const s3Key = `${fileRecord.id}.${getFileExtension(fileRecord.fileName)}`;
  try {
    await deleteFromS3(s3Key);
  } catch (err) {
    logger.warn({ err, s3Key }, 'Failed to remove S3 object');
  }

  if (fileRecord.thumbnailS3Key) {
    try {
      await deleteFromS3ByKey(fileRecord.thumbnailS3Key);
    } catch {
      // Thumbnail cleanup is non-critical.
    }
  }

  if (fileRecord.documentId) {
    try {
      // Both halves take the already-validated `organizationId` rather than
      // reading the session. This is internal cleanup after the delete was
      // authorized upstream, and it also runs with no session at all — the
      // internal `/api/v1/files/[fileId]` route reaches here on a shared
      // secret. A session read could only fail, and the failure was silent:
      // the `catch` below logged a warning and left the UserDocument orphaned.
      const doc = await db.userDocument.findFirst({
        where: { id: fileRecord.documentId, organizationId },
        select: { id: true },
      });
      if (doc) {
        await deleteDocumentFromDbCommand(doc.id, organizationId);
      }
    } catch (err) {
      logger.warn(
        { err, fileId: fileRecord.id },
        'Failed to remove UserDocument',
      );
    }
  }

  try {
    await deleteFileFromVectorStore(fileRecord.id);
  } catch (err) {
    logger.warn({ err, fileId: fileRecord.id }, 'Failed to remove vectors');
  }

  return {
    deleted: true,
    fileId: fileRecord.id,
    fileName: fileRecord.fileName,
  };
}
