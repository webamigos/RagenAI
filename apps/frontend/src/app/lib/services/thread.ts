import OpenAI from 'openai';
import { Thread } from '@prisma/client';

import db from '@salesyy/prisma-client';

import { type CreateThreadDto } from '../../contracts/ThreadDto';

const openai = new OpenAI();

export const getOrCreateThread = async (
  threadPublicId: CreateThreadDto['public_id']
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
        data: { openai_thread_id: thread.id },
      });
    } else {
      thread = await openai.beta.threads.retrieve(
        threadEntity.openai_thread_id
      );
    }

    return { thread, threadEntity };
  } catch {
    // TODO: implement
    throw new Error(`Cannot fetch thread ${threadPublicId}`);
  }
};

export const createThread = async () => {
  // TODO: move creation of Open AI thread to first message
  const thread = await openai.beta.threads.create();
  const threadEntity = await db.thread.create({
    data: { openai_thread_id: thread.id },
  });
  return {
    public_id: threadEntity.public_id,
  };
};

export const getThread = async (publicId: CreateThreadDto['public_id']) => {
  try {
    return await db.thread.findUniqueOrThrow({
      where: { public_id: publicId },
      select: {
        public_id: true,
        // openai_thread_id: true,
        created_at: true,
      },
    });
  } catch (e) {
    throw new Error(`Cannot find thread ${publicId}`);
  }
};
