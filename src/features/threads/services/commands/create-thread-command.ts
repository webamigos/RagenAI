'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
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
        organization_id: orgId,
        user_id: userId,
        project_id: projectId ?? null,
        mentioned_project_id: mentionedProjectId,
        visitor_id: userId ? userId : visitorId,
        preferred_model: preferredModel,
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
            public_id: { in: userFileIds },
            organization_id: orgId,
          },
          select: { public_id: true },
        });

        const validFileIds = new Set(validFiles.map((f) => f.public_id));
        const validDocuments = documentsWithUserFileId.filter((doc) =>
          validFileIds.has(doc.userFileId!),
        );

        if (validDocuments.length > 0) {
          const threadDocumentData = validDocuments.map((doc) => ({
            thread_id: threadRecord.id,
            user_file_id: doc.userFileId!,
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

    return {
      public_id: threadRecord.public_id,
      project_id: projectId ?? null,
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
        public_id: thread.public_id,
        project_id: thread.project_id,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
