'use server';

import db from '@ragenai/prisma-client';

export const getMessageByIdQuery = async (publicMessageId: string) => {
  return await db.message.findUnique({
    where: {
      public_id: publicMessageId,
    },
  });
};
