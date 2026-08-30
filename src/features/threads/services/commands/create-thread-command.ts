'use server';

import { logger } from '@/app/lib/utils/logger';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { ThreadAction } from '../../contracts/thread.types';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

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
