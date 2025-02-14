'use server';

import { cookies } from 'next/headers';
import { Thread } from '@prisma/client';
import { setSentryServiceTag } from '../services/sentry';
import { createNewOpenAIThread } from '../services/thread';
import { logger } from '../utils/logger';
import { visitorCookieName } from '@/app/config';

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

export const createGuestThreadAction = async (): Promise<ThreadAction> => {
  try {
    setSentryServiceTag('guest-threads');
    const cookieStore = await cookies();
    const visitorId = cookieStore.get(visitorCookieName);

    if (!visitorId) {
      throw new Error('Invalid visitor id');
    }
    const thread = await createNewOpenAIThread(visitorId?.value);

    return { success: true, thread };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
