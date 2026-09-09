'use server';

import { logger } from '@/app/lib/utils/logger';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { ThreadAction } from '../../contracts/thread.types';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { KnowledgeScope } from '@ragenai/platform-contracts';

export const createThreadAction = async (
  orgId: string,
  userId: string | undefined,
  projectId?: string,
  mentionedProjectId?: string,
  preferredModel?: string,
  threadDocuments?: ThreadDocumentUI[],
  /**
   * Fixed for the thread's life — the composer picks it before the first
   * message and cannot change it afterwards. Omitted means `KNOWLEDGE_BASE`.
   */
  knowledgeScope?: KnowledgeScope,
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
      body: {
        projectId,
        mentionedProjectId,
        preferredModel,
        threadDocuments,
        knowledgeScope,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
