'use server';

import { Thread, Message, Role, MessageContentType } from '@prisma/client';

import db from '@ragenai/prisma-client';

import { MessageDto } from '../../contracts/Message';
import { createVisitorEntry } from './visitor';
import { logger } from '../utils/logger';
import { setSentryContext, setSentryServiceTag } from './sentry';
import { usageTracker } from './usage';

export type DbMessageDto = {
  id: Message['id'];
  content: Message['content'];
  role: Message['role'];
  run_id?: Message['run_id'];
  source?: Message['source'];
};

const serviceName = 'Message';

export const createMessageInDB = async ({
  threadId,
  message,
  role,
  visitorId,
  runId,
  messageType = 'TEXT',
  voiceDurationSeconds,
}: {
  threadId: Thread['id'];
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
      threadId: threadId,
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
        thread_id: threadId,
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
      include: {
        project: {
          select: {
            id: true,
            public_id: true,
            title: true,
          },
        },
      },
    });

    if (!thread) {
      return { messages: [], threadContext: null };
    }

    const messages = await db.message.findMany({
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

    // Get mentioned project details if exists
    let mentionedProject = null;
    if (thread.mentioned_project_id) {
      try {
        mentionedProject = await db.project.findUnique({
          where: { id: thread.mentioned_project_id },
          select: {
            id: true,
            public_id: true,
            title: true,
          },
        });

        // If mentioned project doesn't exist, log warning but continue
        if (!mentionedProject) {
          logger.warn(
            {
              threadId: thread.id,
              mentionedProjectId: thread.mentioned_project_id,
            },
            'Mentioned project not found, will fallback to regular thread project'
          );
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            threadId: thread.id,
            mentionedProjectId: thread.mentioned_project_id,
          },
          'Error fetching mentioned project, will fallback to regular thread project'
        );
        // mentionedProject stays null, system will use regular project
      }
    }

    // Convert Date objects to ISO strings for serialization
    return {
      messages: messages.map((message) => ({
        ...message,
        created_at: message.created_at.toISOString(),
      })),
      threadContext: {
        project: thread.project,
        mentionedProject,
        mentionedProjectId: thread.mentioned_project_id,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch messages from DB');
    throw error;
  }
};

export const createAndStoreMessage = async ({
  prompt,
  threadId,
  visitorId,
  messageType = 'TEXT',
  voiceDurationSeconds,
}: {
  prompt: string;
  threadId: Thread['id'];
  visitorId?: string;
  messageType?: MessageContentType;
  voiceDurationSeconds?: number;
}): Promise<MessageDto> => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('THREAD_ID', {
      threadId: threadId,
    });
    setSentryContext('EXTRA_DATA', {
      visitorId,
      messageType,
      voiceDurationSeconds,
    });

    const dbMessage = await createMessageInDB({
      threadId: threadId,
      message: {
        id: `msg_${Date.now()}`,
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
      created_at: dbMessage.created_at.toISOString(),
      content: dbMessage.content,
      message_type: dbMessage.message_type,
      voice_duration_seconds: dbMessage.voice_duration_seconds,
      voice_played: dbMessage.voice_played,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to create and store message');
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

export const deleteMessageByPublicId = async (
  publicId: string
): Promise<void> => {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      messageId: publicId,
    });
    await db.message.delete({
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
