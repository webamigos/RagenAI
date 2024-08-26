import db from '@salesyy/prisma-client';

export const getMessageById = async (publicMessageId: string) => {
  return await db.message.findUnique({
    where: {
      public_id: publicMessageId,
    },
  });
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
    },
  });
};
