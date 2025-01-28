import OpenAI from 'openai';

import { Thread } from '@prisma/client';
import db from '@ragenai/prisma-client';
import { auth } from '@clerk/nextjs/server';

import { type CreateThreadDto } from '../../contracts/ThreadDto';
import { setSentryContext, setSentryServiceTag } from './sentry';
import { logger } from '../utils/logger';

const serviceName = 'thread';

const openai = new OpenAI();

export const findOrCreateOpenAIThread = async (
  threadPublicId: CreateThreadDto['public_id'],
  visitorId: string
) => {
  let thread;
  let threadRecord: Thread;

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
    if (!threadRecord.openai_thread_id) {
      thread = await openai.beta.threads.create();
      await db.thread.update({
        where: { public_id: threadPublicId },
        data: {
          openai_thread_id: thread.id,
          visitor_id: visitorId,
        },
      });
    } else {
      thread = await openai.beta.threads.retrieve(
        threadRecord.openai_thread_id
      );
      await db.thread.update({
        where: { public_id: threadPublicId },
        data: {
          visitor_id: visitorId,
        },
      });
    }

    return { thread, threadRecord };
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${threadPublicId}`);
    // TODO: implement
    throw new Error(`Cannot fetch thread ${threadPublicId}`);
  }
};

// TODO: refactor: decouple from OpenAI
export const createNewOpenAIThread = async () => {
  try {
    setSentryServiceTag(serviceName);
    const { orgId, userId } = auth();
    // TODO: in scenario of public chat we should get organization id another way...
    // TODO: move creation of Open AI thread to first message
    const thread = await openai.beta.threads.create();
    // TODO: for guest records we should pass organization id
    const threadRecord = await db.thread.create({
      data: {
        openai_thread_id: thread.id,
        organization_id: orgId,
        user_id: userId,
      },
    });
    return {
      public_id: threadRecord.public_id,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create new Open AI thread');
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
        openai_thread_id: true,
        created_at: true,
        visitor_id: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, `Failed to fetch thread ${publicThreadId}`);
    throw error;
  }
};
