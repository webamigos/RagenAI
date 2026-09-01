'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getVisitorIdFromCookie } from '@/app/lib/services/cookies';
import type { ThreadAction } from '../../contracts/thread.types';

export const createGuestThreadCommand = async ({
  organizationId,
  projectId,
  initialMessage,
  mentionedProjectId,
  preferredModel,
}: {
  organizationId?: string;
  projectId?: string;
  initialMessage?: string;
  mentionedProjectId?: string;
  preferredModel?: string;
}): Promise<ThreadAction> => {
  try {
    const visitorId = await getVisitorIdFromCookie();

    const threadRecord = await db.thread.create({
      data: {
        organizationId: organizationId,
        visitorId: visitorId,
        projectId: projectId,
        mentionedProjectId: mentionedProjectId,
        preferredModel: preferredModel,
      },
    });

    // Note: initialMessage is NOT saved here — it's stored in sessionStorage
    // and processed by usePublicAssistantLogic.fetchData which triggers the
    // assistant stream (saving + AI response) to avoid duplicate messages.

    return {
      success: true,
      thread: {
        id: threadRecord.id,
        projectId: projectId ?? null,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
