'use server';

import OpenAI from 'openai';
import { Thread, Message, Role, MessageContentType } from '@prisma/client';

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
  messageType = 'TEXT',
  voiceDurationSeconds,
}: {
  thread: Thread;
  message: Omit<DbMessageDto, 'role'>;
  role: Role;
  visitorId?: string;
  runId?: string;
  messageType?: MessageContentType;
  voiceDurationSeconds?: number;
}) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      threadId: thread.id,
    });
    setSentryContext('EXTRA_DATA', {
      // messageId: message.id,
      role,
      visitorId,
      runId,
      messageType,
      voiceDurationSeconds,
    });

    usageTracker.incMessagesCount(role);

    return await db.message.create({
      data: {
        thread_id: thread.id,
        openai_message_id: message.id,
        openai_created_at: message.created_at,
        content: message.content,
        role,
        visitor_id: visitorId,
        run_id: runId,
        message_type: messageType,
        voice_duration_seconds: voiceDurationSeconds,
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
        voice_duration_seconds: true,
        message_type: true,
        voice_played: true,
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
  messageType = 'TEXT',
  voiceDurationSeconds,
}: {
  prompt: string;
  thread?: OpenAI.Beta.Threads.Thread;
  threadEntity: Thread;
  visitorId?: string;
  messageType?: MessageContentType;
  voiceDurationSeconds?: number;
}): Promise<MessageDto> => {
  try {
    setSentryServiceTag(serviceName);
    if (thread) {
      setSentryContext('THREAD_ID', {
        threadId: thread.id,
      });
    }

    setSentryContext('EXTRA_DATA', {
      visitorId,
      messageType,
      voiceDurationSeconds,
    });
    // TODO: this is refactored inside DEV-78
    // const threadId = thread?.id;
    // const threadMessage = await openai.beta.threads.messages.create(threadId, {
    //   role: 'user',
    //   content: prompt.trim(), // TODO: sanitize
    // });
    // https://github.com/openai/openai-node/issues/454#issuecomment-1806646751
    // const userMessageContent = parseThreadMessage(threadMessage);

    const dbMessage = await createMessageInDB({
      thread: threadEntity,
      message: {
        id: `msg_${Date.now()}`,
        created_at: Math.floor(new Date().getTime() / 1000), // FIXME: temporary and solved in DEV-78
        content: prompt.trim(),
      },
      role: Role.USER,
      visitorId,
      messageType,
      voiceDurationSeconds,
    });

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
      message_type: dbMessage.message_type,
      voice_duration_seconds: dbMessage.voice_duration_seconds,
      voice_played: dbMessage.voice_played,
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

export const updateMessagePlayedStatus = async (messagePublicId: string) => {
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
        voice_played: true,
        message_type: 'VOICE',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update message played status');
    throw error;
  }
};
