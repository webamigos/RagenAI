'use server';

import { Thread } from '@prisma/client';
import { setSentryServiceTag } from '../services/sentry';
import { createNewOpenAIThread } from '../services/thread';
import { logger } from '../utils/logger';
import { createAndStoreOpenAIThreadMessage } from '../services/message';
import db from '@ragenai/prisma-client';
import OpenAI from 'openai';

const openai = new OpenAI();

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
  initialMessage?: string,
  visitorId?: string
): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('guest-threads');
    const openAiThread = await openai.beta.threads.create();
    const threadEntity = await db.thread.create({
      data: { openai_thread_id: openAiThread.id, visitor_id: visitorId },
    });

    if (initialMessage && visitorId) {
      await createAndStoreOpenAIThreadMessage({
        threadEntity,
        prompt: initialMessage,
        visitorId,
      });
    }

    return { success: true, thread: { public_id: threadEntity.public_id } };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
