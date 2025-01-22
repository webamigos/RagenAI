'use server';

import OpenAI from 'openai';
import { Thread, Message, Role } from '@prisma/client';

import db from '@ragenai/prisma-client';

import { parseThreadMessage } from './utils';
import { MessageDto } from '../../contracts/Message';
import { createVisitorEntry } from './visitor';
import { logger } from '../utils/logger';
import { setSentryContext, setSentryServiceTag } from './sentry';
import { usageTracker } from './usage';

export type DbMessageDto = {
  id: Message['id'];
  created_at: Message['openai_created_at'];
  content: Message['content'];
  role: Message['role'];
  run_id?: Message['run_id'];
};

const openai = new OpenAI();
const serviceName = 'Message';

export const createMessageInDB = async ({
  thread,
  message,
  role,
  visitorId,
  runId,
}: {
  thread: Thread;
  message: Omit<DbMessageDto, 'role'>;
  role: Role;
  visitorId?: string;
  runId?: string;
}) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      threadId: thread.id,
    });
    setSentryContext('EXTRA_DATA', {
      messageId: message.id,
      role,
      visitorId,
      runId,
    });

    usageTracker.trackMessagesCount(role, 1);

    return await db.message.create({
      data: {
        thread_id: thread.id,
        openai_message_id: message.id,
        openai_created_at: message.created_at,
        content: message.content,
        role,
        visitor_id: visitorId,
        run_id: runId,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create message in DB');
    throw error;
  }
};

export const fetchMessagesFromDb = async (
  threadPublicId: Thread['public_id'],
  visitorId: Thread['visitor_id']
) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      threadId: threadPublicId,
    });
    setSentryContext('EXTRA_DATA', {
      visitorId,
    });

    const thread = await db.thread.findUnique({
      where: { public_id: threadPublicId, visitor_id: visitorId },
    });

    if (!thread) {
      return [];
    }

    return db.message.findMany({
      where: { thread_id: thread?.id },
      select: {
        public_id: true,
        created_at: true,
        content: true,
        role: true,
        run_id: true,
        rate: true,
      },
      orderBy: [
        {
          created_at: 'asc',
        },
      ],
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch messages from DB');
    throw error;
  }
};

export const createAndStoreOpenAIThreadMessage = async ({
  prompt,
  thread,
  threadEntity,
  visitorId,
}: {
  prompt: string;
  thread: OpenAI.Beta.Threads.Thread;
  threadEntity: Thread;
  visitorId?: string;
}): Promise<MessageDto> => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      threadId: thread.id,
    });
    setSentryContext('EXTRA_DATA', {
      visitorId,
    });
    const threadId = thread.id;
    const threadMessage = await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: prompt.trim(), // TODO: sanitize
    });
    // https://github.com/openai/openai-node/issues/454#issuecomment-1806646751
    const userMessageContent = parseThreadMessage(threadMessage);

    const dbMessage = await createMessageInDB({
      thread: threadEntity,
      message: {
        id: threadMessage.id,
        created_at: threadMessage.created_at,
        content: userMessageContent,
      },
      role: Role.USER,
      visitorId,
    }); // TODO: can trow an error

    if (visitorId) {
      try {
        createVisitorEntry(dbMessage, visitorId);
      } catch (error) {
        logger.error({ err: error }, 'Cannot create visitor entry');
      }
    }

    return {
      public_id: dbMessage.public_id,
      role: dbMessage.role,
      created_at: dbMessage.created_at,
      content: dbMessage.content,
    };
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to create and store OpenAI thread message'
    );
    throw error;
  }
};

export const getMessageById = async (publicMessageId: string) => {
  return await db.message.findUnique({
    where: {
      public_id: publicMessageId,
    },
  });
};

export const saveRateInDB = async (messagePublicId: string, rate: number) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      messageId: messagePublicId,
    });
    return await db.message.update({
      where: {
        public_id: messagePublicId,
      },
      data: {
        rate,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to save rate in DB');
    throw error;
  }
};

export const deleteMessageByPublicId = (publicId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      messageId: publicId,
    });
    return db.message.delete({
      where: { public_id: publicId },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete message by public ID');
    throw error;
  }
};
