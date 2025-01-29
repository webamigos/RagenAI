import { Thread } from '@prisma/client';
import db from '@ragenai/prisma-client';
import { auth } from '@clerk/nextjs/server';

import { type CreateThreadDto } from '../../contracts/ThreadDto';
import { setSentryContext, setSentryServiceTag } from './sentry';
import { logger } from '../utils/logger';

export const serviceName = 'thread';

export const findOrCreateThread = async (
  threadPublicId: CreateThreadDto['public_id'],
  visitorId: string
) => {
  let threadEntity: Thread;

  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      threadPublicId,
    });
    setSentryContext('EXTRA_DATA', {
      visitorId,
    });

    threadRecord = await db.thread.findUniqueOrThrow({
      where: { public_id: threadPublicId },
    });

    await db.thread.update({
      where: { public_id: threadPublicId },
      data: {
        visitor_id: visitorId,
      },
    });

    return { threadEntity };
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${threadPublicId}`);
    // TODO: implement
    throw new Error(`Cannot fetch thread ${threadPublicId}`);
  }
};

export const createNewThread = async () => {
  try {
    setSentryServiceTag(serviceName);
    const threadEntity = await db.thread.create({
      data: {},
    });
    return {
      public_id: threadRecord.public_id,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create new thread');
    throw error;
  }
};

export const getThreadMessages = async (publicThreadId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      publicThreadId,
    });
    return await db.thread.findUnique({
      where: {
        public_id: publicThreadId,
      },
      select: {
        messages: {
          orderBy: {
            created_at: 'asc',
          },
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};

export const getThreadDetails = async (publicThreadId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      publicThreadId,
    });
    return await db.thread.findUniqueOrThrow({
      where: { public_id: publicThreadId },
      select: {
        id: true,
        public_id: true,
        created_at: true,
        visitor_id: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};
