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
  projectId?: number;
  initialMessage?: string;
  mentionedProjectId?: number;
  preferredModel?: string;
}): Promise<ThreadAction> => {
  try {
    const visitorId = await getVisitorIdFromCookie();

    const threadRecord = await db.thread.create({
      data: {
        organization_id: organizationId,
        visitor_id: visitorId,
        project_id: projectId,
        mentioned_project_id: mentionedProjectId,
        preferred_model: preferredModel,
      },
    });

    // Note: initialMessage is NOT saved here — it's stored in sessionStorage
    // and processed by usePublicAssistantLogic.fetchData which triggers the
    // assistant stream (saving + AI response) to avoid duplicate messages.

    return {
      success: true,
      thread: {
        public_id: threadRecord.public_id,
        project_id: projectId ?? null,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
