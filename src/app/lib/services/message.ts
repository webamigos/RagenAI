'use server';

import OpenAI from 'openai';
import { Thread, Message, Role } from '@prisma/client';

import db from '@salesyy/prisma-client';

import { parseThreadMessage } from './utils';
import { MessageDto } from '../../contracts/Message';
import { createVisitorEntry } from './visitor';
import { logger } from '../utils/logger';

export type DbMessageDto = {
  id: Message['id'];
  created_at: Message['openai_created_at'];
  content: Message['content'];
  role: Message['role'];
};

const openai = new OpenAI();

export const createMessageInDB = async ({
  thread,
  message,
  role,
  visitorId,
}: {
  thread: Thread;
  message: Omit<DbMessageDto, 'role'>;
  role: Role;
  visitorId?: string;
}) => {
  return await db.message.create({
    data: {
      thread_id: thread.id,
      openai_message_id: message.id,
      openai_created_at: message.created_at,
      content: message.content,
      role,
      visitor_id: visitorId,
    },
  });
};

export const fetchMessagesFromDb = async (
  threadPublicId: Thread['public_id'],
  visitorId: Thread['visitor_id']
) => {
  const thread = await db.thread.findUnique({
    where: { public_id: threadPublicId },
  });

  return db.message.findMany({
    where: { thread_id: thread?.id, visitor_id: visitorId },
    select: {
      public_id: true,
      created_at: true,
      content: true,
      role: true,
    },
    orderBy: [
      {
        created_at: 'asc',
      },
    ],
  });
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
    } catch {
      logger.error('Cannot create visitor entry');
    }
  }

  return {
    public_id: dbMessage.public_id,
    role: dbMessage.role,
    created_at: dbMessage.created_at,
    content: dbMessage.content,
  };
};
