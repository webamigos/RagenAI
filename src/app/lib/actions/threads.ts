'use server';

import db from '@ragenai/prisma-client';
import { Thread } from '@prisma/client';
import { setSentryServiceTag } from '../services/sentry';
import { createNewOpenAIThread } from '../services/thread';
import { logger } from '../utils/logger';
import { createAndStoreMessage } from '../services/message';
import { getVisitorIdFromCookie } from '../services/cookies';

type ThreadAction =
  | {
      success: true;
      thread: {
        public_id: Thread['public_id'];
      };
    }
  | {
      success: false;
      errorMessage: string;
    };

export const createThreadAction = async (): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('threads');
    const thread = await createNewOpenAIThread();

    return { success: true, thread };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};

export const createGuestThreadAction = async (
  initialMessage?: string
): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('guest-threads');

    const visitorId = await getVisitorIdFromCookie();

    const threadRecord = await db.thread.create({
      data: { visitor_id: visitorId },
    });

    if (initialMessage && visitorId) {
      await createAndStoreMessage({
        threadId: threadRecord.id,
        prompt: initialMessage,
        visitorId: visitorId,
      });
    }

    return { success: true, thread: { public_id: threadRecord.public_id } };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
