'use server';

import db from '@ragenai/prisma-client';
import { nanoid } from 'nanoid';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { canManageOrg } from '@/lib/auth-access-control';
import { deleteFileCommand } from '@/features/documents/services/commands/delete-file-command';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/client';
import type { PermissionLevel } from '@/features/documents/contracts/permission.types';
import { logger } from '@/app/lib/utils/logger';
import { UnauthorizedException } from '@/libs/utils/errors';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

type OperationResult = { success: true } | { success: false; error: string };

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
  const admin = member ? canManageOrg(member.role) : false;

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
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedException('Unauthenticated');
  }
  const member = await getActiveMember(orgId).catch(() => null);
  const admin = member ? canManageOrg(member.role) : false;

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

    const canMove = admin || fileRecord.ownerId === userId;
    if (!canMove) {
      failed.push({
        fileId,
        fileName: fileRecord.fileName ?? fileId,
        error: 'insufficient_permissions',
      });
      continue;
    }

    try {
      const result = await ragenApiRequest<OperationResult>({
        method: 'POST',
        path: `/v1/internal/files/${encodeURIComponent(fileId)}/move`,
        userId,
        orgId,
        body: { folderId },
      });
      if (result.success) {
        succeeded.push(fileId);
      } else {
        failed.push({
          fileId,
          fileName: fileRecord.fileName ?? fileId,
          error: result.error,
        });
      }
    } catch (err) {
      logger.error(
        { err, fileId },
        'bulkMoveFilesToFolderAction: unexpected error',
      );
      failed.push({
        fileId,
        fileName: fileRecord.fileName ?? fileId,
        error: 'unexpected_error',
      });
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
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new UnauthorizedException('Unauthenticated');
  }
  const member = await getActiveMember(orgId).catch(() => null);
  const admin = member ? canManageOrg(member.role) : false;

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

    const canShare = admin || fileRecord.ownerId === userId;
    if (!canShare) {
      failed.push({
        fileId,
        fileName: fileRecord.fileName ?? fileId,
        error: 'insufficient_permissions',
      });
      continue;
    }

    try {
      const result = await ragenApiRequest<OperationResult>({
        method: 'POST',
        path: `/v1/internal/files/${encodeURIComponent(fileId)}/share`,
        userId,
        orgId,
        body: { granteeType, granteeId, permission },
      });
      if (result.success) {
        succeeded.push(fileId);
      } else {
        failed.push({
          fileId,
          fileName: fileRecord.fileName ?? fileId,
          error: result.error,
        });
      }
    } catch (err) {
      logger.error({ err, fileId }, 'bulkShareFilesAction: unexpected error');
      failed.push({
        fileId,
        fileName: fileRecord.fileName ?? fileId,
        error: 'unexpected_error',
      });
    }
  }

  return { succeeded, failed };
}

export async function bulkReembedFilesAction(
  fileIds: string[],
): Promise<BulkActionResult> {
  const orgId = await getOrgIdFromAuthOrThrow();

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
      await db.userFile.update({
        where: { id: fileRecord.id },
        data: {
          embeddingStatus: EmbeddingStatus.NOT_STARTED,
          parsingStatus: ParsingStatus.NOT_STARTED,
          embeddingStartedAt: null,
          embeddingCompletedAt: null,
          embeddingFailedAt: null,
        },
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
