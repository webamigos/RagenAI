'use server';

import db from '@ragenai/prisma-client';
import { Thread } from '@prisma/client';
import { setSentryServiceTag } from '../services/sentry';
import { createNewThreadInDb } from '../services/thread';
import { logger } from '../utils/logger';
import { createAndStoreMessage } from '../services/message';
import { getVisitorIdFromCookie } from '../services/cookies';

type ThreadAction =
  | {
      success: true;
      thread: {
        public_id: Thread['public_id'];
        project_id?: number;
      };
    }
  | {
      success: false;
      errorMessage: string;
    };

export const createThreadAction = async (
  projectId?: number
): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('threads');

    const thread = await createNewThreadInDb({
      visitorId: null,
      projectId,
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

export const createGuestThreadAction = async ({
  organizationId,
  projectId,
  initialMessage,
}: {
  organizationId?: string;
  projectId?: number;
  initialMessage?: string;
}): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('guest-threads');

    const visitorId = await getVisitorIdFromCookie();

    const threadRecord = await db.thread.create({
      data: {
        organization_id: organizationId,
        visitor_id: visitorId,
        project_id: projectId,
      },
    });

    if (initialMessage && visitorId) {
      await createAndStoreMessage({
        threadId: threadRecord.id,
        prompt: initialMessage,
        visitorId: visitorId,
      });
    }

    return {
      success: true,
      thread: {
        public_id: threadRecord.public_id,
        project_id: projectId,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
