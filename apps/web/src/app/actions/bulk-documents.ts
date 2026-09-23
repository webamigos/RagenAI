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
import { jobs } from '@/libs/jobs';
import { Workflow } from '@/features/documents/contracts/document.types';
import {
  EmbeddingStatus,
  ParsingStatus,
  PiiPolicy,
} from '@/generated/prisma/client';
import type { PermissionLevel } from '@/features/documents/contracts/permission.types';
import { logger } from '@/app/lib/utils/logger';
import { UnauthorizedException } from '@/libs/utils/errors';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import {
  sendStagedToKnowledgeBaseCommand,
  type SendStagedResult,
} from '@/features/documents/services/commands/send-staged-to-knowledge-base-command';

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
      // Before the start, not after. The worker's status writers refuse to
      // write over CANCELLED, so a file cancelled earlier would accept nothing
      // from its new run — the run would go through and record no status at
      // all. Every other producer that restarts an ingest clears first for the
      // same reason.
      await db.userFile.update({
        where: { id: fileRecord.id, organizationId: orgId },
        data: {
          embeddingStatus: EmbeddingStatus.NOT_STARTED,
          parsingStatus: ParsingStatus.NOT_STARTED,
          embeddingStartedAt: null,
          embeddingCompletedAt: null,
          embeddingFailedAt: null,
          // Recorded here too, so a cancel can find the run. This path left it
          // unset, which made a bulk re-embed uncancellable.
          workflowId,
        },
      });

      await jobs().start(Workflow.RUN_FILE_EMBEDDINGS, workflowId, {
        fileId: fileRecord.id,
        orgId,
      });
      succeeded.push(fileRecord.id);
    } catch (err) {
      logger.error(
        { err, fileId: fileRecord.id },
        'bulkReembedFilesAction: job start failed',
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

/**
 * Set one PII policy across a selection.
 *
 * **Org managers only, not owners.** The per-row policy select renders behind
 * `canManageOrg` — a member cannot change the policy on a file they own — and
 * a bulk path that accepted the owner check the way delete and share do would
 * be a quieter way to do what the column refuses.
 *
 * It changes the policy and nothing else. A policy only takes effect when the
 * file is parsed again, and the caller decides whether to reprocess now: the
 * row does the same, revealing a Reprocess button once the select changes
 * rather than restarting the workflow under the person's hand.
 */
export async function bulkUpdatePiiPolicyAction(
  fileIds: string[],
  piiPolicy: PiiPolicy,
): Promise<BulkActionResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const member = await getActiveMember(orgId).catch(() => null);
  if (!member || !canManageOrg(member.role)) {
    throw new UnauthorizedException('Insufficient permissions');
  }

  const VALID = new Set<string>(Object.values(PiiPolicy));
  if (!VALID.has(piiPolicy)) {
    throw new Error(`Invalid piiPolicy: ${piiPolicy}`);
  }

  const succeeded: string[] = [];
  const failed: { fileId: string; fileName: string; error: string }[] = [];

  for (const fileId of fileIds) {
    const fileRecord = await db.userFile.findFirst({
      where: { id: fileId, organizationId: orgId },
      select: { id: true, fileName: true },
    });

    if (!fileRecord) {
      failed.push({ fileId, fileName: fileId, error: 'not_found' });
      continue;
    }

    try {
      await db.userFile.update({
        where: { id: fileId, organizationId: orgId },
        data: { piiPolicy },
      });
      succeeded.push(fileId);
    } catch (err) {
      logger.error({ err, fileId }, 'bulkUpdatePiiPolicyAction: update failed');
      failed.push({
        fileId,
        fileName: fileRecord.fileName ?? fileId,
        error: 'update_failed',
      });
    }
  }

  return { succeeded, failed };
}

/**
 * Send documents staged into Ragen Brain to the knowledge base (spec F5).
 * The organization and the caller come from the session: a manager sends
 * any staged file of the organization, anyone else only their own.
 */
export async function sendStagedToKnowledgeBaseAction(
  fileIds: string[],
): Promise<SendStagedResult> {
  const organizationId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  const member = await getActiveMember(organizationId).catch(() => null);
  const admin = member ? canManageOrg(member.role) : false;
  if (!member || !userId) {
    return { sent: [], skipped: fileIds.slice(0, 500) };
  }
  return sendStagedToKnowledgeBaseCommand({
    organizationId,
    fileIds: fileIds.slice(0, 500),
    onlyOwnedBy: admin ? null : userId,
  });
}
