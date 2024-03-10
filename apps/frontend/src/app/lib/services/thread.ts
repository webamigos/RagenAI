import OpenAI from 'openai';
import { Thread } from '@prisma/client';

import db from '@salesyy/prisma-client';

import { ThreadDto } from '../../contracts/ThreadDto';

const openai = new OpenAI();

export const createThread = async () => {
  const thread = await openai.beta.threads.create();
  const threadEntity = await db.thread.create({
    data: { openai_thread_id: thread.id },
  });
  return {
    public_id: threadEntity.public_id,
  };
};

export const getThread = async (publicId: ThreadDto['public_id']) => {
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
