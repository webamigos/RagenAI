'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { ThreadAction } from '../../contracts/thread.types';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

export const createThreadCommand = async ({
  visitorId,
  projectId,
  mentionedProjectId,
  preferredModel,
  threadDocuments,
  orgId,
  userId,
}: {
  visitorId: string | null | undefined;
  projectId?: string;
  mentionedProjectId?: string;
  preferredModel?: string;
  threadDocuments?: ThreadDocumentUI[];
  orgId: string;
  userId?: string;
}) => {
  try {
    if (!orgId) {
      throw new Error('Organization ID is required');
    }

    const threadRecord = await db.thread.create({
      data: {
        organizationId: orgId,
        userId: userId,
        projectId: projectId ?? null,
        mentionedProjectId: mentionedProjectId,
        visitorId: userId ? userId : visitorId,
        preferredModel: preferredModel,
      },
    });

    if (threadDocuments && threadDocuments.length > 0 && userId && orgId) {
      const documentsWithUserFileId = threadDocuments.filter(
        (doc) => doc.userFileId,
      );

      if (documentsWithUserFileId.length > 0) {
        const userFileIds = documentsWithUserFileId.map(
          (doc) => doc.userFileId!,
        );

        const validFiles = await db.userFile.findMany({
          where: {
            id: { in: userFileIds },
            organizationId: orgId,
          },
          select: { id: true },
        });

        const validFileIds = new Set(validFiles.map((f) => f.id));
        const validDocuments = documentsWithUserFileId.filter((doc) =>
          validFileIds.has(doc.userFileId!),
        );

        if (validDocuments.length > 0) {
          const threadDocumentData = validDocuments.map((doc) => ({
            threadId: threadRecord.id,
            userFileId: doc.userFileId!,
          }));

          await db.threadDocument.createMany({
            data: threadDocumentData,
          });
        }
      }

      logger.info(
        {
          threadId: threadRecord.id,
          totalThreadDocumentsCount: threadDocuments.length,
          savedThreadDocumentsCount: documentsWithUserFileId.length,
          userFileIds: documentsWithUserFileId.map((doc) => doc.userFileId),
        },
        'Created ThreadDocument relationships for uploaded files',
      );
    }

    trackAudit({
      action: 'thread.created',
      entityType: 'thread',
      entityId: threadRecord.id,
      newData: { projectId: projectId ?? null },
    });

    return {
      id: threadRecord.id,
      projectId: projectId ?? null,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create new thread');
    throw error;
  }
};

export const createThreadAction = async (
  orgId: string,
  userId: string | undefined,
  projectId?: string,
  mentionedProjectId?: string,
  preferredModel?: string,
  threadDocuments?: ThreadDocumentUI[],
): Promise<ThreadAction> => {
  if (!userId) {
    return { success: false, errorMessage: 'Cannot create thread' };
  }
  try {
    return await ragenApiRequest<ThreadAction>({
      method: 'POST',
      path: '/v1/internal/threads',
      userId,
      orgId,
      body: { projectId, mentionedProjectId, preferredModel, threadDocuments },
    });
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
