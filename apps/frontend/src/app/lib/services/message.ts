'use server';

import OpenAI from 'openai';
import { Thread, Message, Role } from '@prisma/client';

import db from '@salesyy/prisma-client';

import { api } from './config';
import { parseThreadMessage } from './utils';

type MessageDto = {
  id: Message['id'];
  created_at: Message['openai_created_at'];
  content: Message['content'];
  role: Message['role'];
};

type MessagesQueryKey = {
  queryKey: [string, { threadId: string }];
};

const openai = new OpenAI();

export const createMessage = async ({
  thread,
  message,
  role,
}: {
  thread: Thread;
  message: Omit<MessageDto, 'role'>;
  role: Role;
}) => {
  // TODO: moderation
  return await db.message.create({
    data: {
      thread_id: thread.id,
      openai_message_id: message.id,
      openai_created_at: message.created_at,
      content: message.content,
      role,
    },
  });
};

export const fetchMessagesFromApi = async ({ queryKey }: MessagesQueryKey) => {
  const [_key, { threadId }] = queryKey;
  return api.get<MessageDto[]>(`/threads/${threadId}/messages`);
};

export const fetchMessagesFromDb = async (
  threadPublicId: Thread['public_id']
) => {
  const thread = await db.thread.findUnique({
    where: { public_id: threadPublicId },
  });

  return db.message.findMany({
    where: { thread_id: thread?.id },
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
  // return db.thread.findUniqueOrThrow({
  //   where: { public_id: threadPublicId },
  //   select: {
  //     messages: true,
  //   },
  // });
};

export const createThreadMessage = async ({
  prompt,
  thread,
  threadEntity,
}: {
  prompt: string;
  thread: OpenAI.Beta.Threads.Thread;
  threadEntity: Thread;
}) => {
  const threadId = thread.id;
  const threadMessage = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: prompt.trim(), // TODO: sanitize
  });
  // https://github.com/openai/openai-node/issues/454#issuecomment-1806646751
  console.log({ messageFromThread: threadMessage.content });
  const userMessageContent = parseThreadMessage(threadMessage);

  console.log({ threadMessage, content: userMessageContent });
  const dbMessage = await createMessage({
    thread: threadEntity,
    message: {
      id: threadMessage.id,
      created_at: threadMessage.created_at,
      content: userMessageContent,
    },
    role: Role.USER,
  }); // TODO: can trow an error

  return {
    public_id: dbMessage.public_id,
    role: dbMessage.role,
    created_at: dbMessage.created_at,
    content: dbMessage.content,
  };
};
