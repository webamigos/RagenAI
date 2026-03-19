'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { ThreadAction } from '../../contracts/thread.types';

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
  projectId?: number;
  mentionedProjectId?: number;
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
            publicId: { in: userFileIds },
            organizationId: orgId,
          },
          select: { publicId: true },
        });

        const validFileIds = new Set(validFiles.map((f) => f.publicId));
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
      orgId,
      userId,
      action: 'thread.created',
      entityType: 'thread',
      entityId: threadRecord.publicId,
      newData: { projectId: projectId ?? null },
    });

    return {
      publicId: threadRecord.publicId,
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
  projectId?: number,
  mentionedProjectId?: number,
  preferredModel?: string,
  threadDocuments?: ThreadDocumentUI[],
): Promise<ThreadAction> => {
  try {
    const thread = await createThreadCommand({
      visitorId: null,
      projectId,
      mentionedProjectId,
      preferredModel,
      threadDocuments,
      orgId,
      userId,
    });

    return {
      success: true,
      thread: {
        publicId: thread.publicId,
        projectId: thread.projectId,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
