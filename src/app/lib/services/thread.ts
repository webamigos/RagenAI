import OpenAI from 'openai';

import { Thread } from '@prisma/client';
import db from '@salesyy/prisma-client';

import { type CreateThreadDto } from '../../contracts/ThreadDto';

const openai = new OpenAI();

export const findOrCreateOpenAIThread = async (
  threadPublicId: CreateThreadDto['public_id'],
  visitorId: string
) => {
  let thread;
  let threadEntity: Thread;

  try {
    threadEntity = await db.thread.findUniqueOrThrow({
      where: { public_id: threadPublicId },
    });
    if (!threadEntity.openai_thread_id) {
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
        threadEntity.openai_thread_id
      );
      await db.thread.update({
        where: { public_id: threadPublicId },
        data: {
          visitor_id: visitorId,
        },
      });
    }

    return { thread, threadEntity };
  } catch {
    // TODO: implement
    throw new Error(`Cannot fetch thread ${threadPublicId}`);
  }
};

export const createNewOpenAIThread = async () => {
  // TODO: move creation of Open AI thread to first message
  const thread = await openai.beta.threads.create();
  const threadEntity = await db.thread.create({
    data: { openai_thread_id: thread.id },
  });
  return {
    public_id: threadEntity.public_id,
  };
};

export const getThreadMessages = async (publicThreadId: string) => {
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
};

export const getThreadDetails = async (publicThreadId: string) => {
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
};
