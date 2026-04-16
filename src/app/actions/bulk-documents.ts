'use server';

import db from '@ragenai/prisma-client';
import { nanoid } from 'nanoid';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { deleteFileCommand } from '@/features/documents/services/commands/delete-file-command';
import { moveFileToFolderCommand } from '@/features/documents/services/commands/move-file-to-folder-command';
import { shareResourceCommand } from '@/features/documents/services/commands/share-resource-command';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/client';
import type { PermissionLevel } from '@/features/documents/contracts/permission.types';
import { logger } from '@/app/lib/utils/logger';

export type BulkActionResult = {
  succeeded: string[];
  failed: { fileId: string; fileName: string; error: string }[];
};

export async function bulkDeleteFilesAction(
  fileIds: string[],
): Promise<BulkActionResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  const member = await getActiveMember(orgId).catch(() => null);
  const admin = member ? isOrgAdmin(member.role) : false;

  const succeeded: string[] = [];
  const failed: { fileId: string; fileName: string; error: string }[] = [];

  for (const fileId of fileIds) {
    const fileRecord = await db.userFile.findFirst({
      where: { id: fileId, organizationId: orgId },
      select: { id: true, ownerId: true, fileName: true },
    });

    if (!fileRecord) {
      failed.push({ fileId, fileName: fileId, error: 'not_found' });
      continue;
    }

    const canDelete = admin || fileRecord.ownerId === userId;
    if (!canDelete) {
      failed.push({
        fileId,
        fileName: fileRecord.fileName ?? fileId,
        error: 'insufficient_permissions',
      });
      continue;
    }

    try {
      const result = await deleteFileCommand({ fileId, organizationId: orgId });
      if (result.deleted) {
        succeeded.push(fileId);
      } else {
        failed.push({
          fileId,
          fileName: fileRecord.fileName ?? fileId,
          error: 'delete_failed',
        });
      }
    } catch (err) {
      logger.error({ err, fileId }, 'bulkDeleteFilesAction: unexpected error');
      failed.push({
        fileId,
        fileName: fileRecord.fileName ?? fileId,
        error: 'unexpected_error',
      });
    }
  }

  return { succeeded, failed };
}

export async function bulkMoveFilesToFolderAction(
  fileIds: string[],
  folderId: string | null,
): Promise<BulkActionResult> {
  const orgId = await getOrgIdFromAuthOrThrow();

  const succeeded: string[] = [];
  const failed: { fileId: string; fileName: string; error: string }[] = [];

  for (const fileId of fileIds) {
    try {
      const result = await moveFileToFolderCommand(fileId, folderId, orgId);
      if (result.success) {
        succeeded.push(fileId);
      } else {
        failed.push({ fileId, fileName: fileId, error: result.error });
      }
    } catch (err) {
      logger.error(
        { err, fileId },
        'bulkMoveFilesToFolderAction: unexpected error',
      );
      failed.push({ fileId, fileName: fileId, error: 'unexpected_error' });
    }
  }

  return { succeeded, failed };
}

export async function bulkShareFilesAction(
  fileIds: string[],
  granteeType: 'user' | 'team',
  granteeId: string,
  permission: PermissionLevel,
): Promise<BulkActionResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = (await getCurrentUserId()) ?? '';

  const succeeded: string[] = [];
  const failed: { fileId: string; fileName: string; error: string }[] = [];

  for (const fileId of fileIds) {
    try {
      const result = await shareResourceCommand({
        resourceType: 'file',
        fileId,
        organizationId: orgId,
        granteeType,
        granteeId,
        permission,
        grantedBy: userId,
      });
      if (result.success) {
        succeeded.push(fileId);
      } else {
        failed.push({ fileId, fileName: fileId, error: result.error });
      }
    } catch (err) {
      logger.error({ err, fileId }, 'bulkShareFilesAction: unexpected error');
      failed.push({ fileId, fileName: fileId, error: 'unexpected_error' });
    }
  }

  return { succeeded, failed };
}

export async function bulkReembedFilesAction(
  fileIds: string[],
): Promise<BulkActionResult> {
  const orgId = await getOrgIdFromAuthOrThrow();

  // Reset statuses for all files in one query
  await db.userFile.updateMany({
    where: { id: { in: fileIds }, organizationId: orgId },
    data: {
      embeddingStatus: EmbeddingStatus.NOT_STARTED,
      parsingStatus: ParsingStatus.NOT_STARTED,
      embeddingStartedAt: null,
      embeddingCompletedAt: null,
      embeddingFailedAt: null,
    },
  });

  const fileRecords = await db.userFile.findMany({
    where: { id: { in: fileIds }, organizationId: orgId },
  });

  const succeeded: string[] = [];
  const failed: { fileId: string; fileName: string; error: string }[] = [];

  for (const fileRecord of fileRecords) {
    const workflowId = `reembed-${nanoid()}`;
    try {
      const client = getTemporalClient();
      await client.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
        taskQueue: TASK_QUEUE_NAME,
        workflowId,
        args: [
          {
            ...fileRecord,
            requestId: workflowId,
          },
        ],
      });
      succeeded.push(fileRecord.id);
    } catch (err) {
      logger.error(
        { err, fileId: fileRecord.id },
        'bulkReembedFilesAction: workflow start failed',
      );
      failed.push({
        fileId: fileRecord.id,
        fileName: fileRecord.fileName ?? fileRecord.id,
        error: 'workflow_start_failed',
      });
    }
  }

  // Any fileIds not found in DB
  const foundIds = new Set(fileRecords.map((f) => f.id));
  for (const fileId of fileIds) {
    if (!foundIds.has(fileId)) {
      failed.push({ fileId, fileName: fileId, error: 'not_found' });
    }
  }

  return { succeeded, failed };
}
