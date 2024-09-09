import { Message } from '@prisma/client';
import { startOfDay, setHours } from 'date-fns';

import db from '@salesyy/prisma-client';

const today = new Date();
const midnightToday = setHours(startOfDay(today), 0);

export const createVisitorEntry = async (
  message: Message,
  visitorId: string
) => {
  return await db.visitorMessages.create({
    data: {
      message_id: message.id,
      visitor_id: visitorId,
    },
  });
};

export const getLast24hVisitorMessages = async (
  visitorId: string
): Promise<number> => {
  return await db.visitorMessages.count({
    where: {
      AND: [
        {
          visitor_id: visitorId,
        },
        {
          created_at: {
            gte: midnightToday,
          },
        },
      ],
    },
  });
};

export const clearVisitorMessages = async () => {
  return await db.visitorMessages.deleteMany({
    where: {
      created_at: {
        gte: midnightToday,
      },
    },
  });
};

export const getUserThreads = async (
  visitorId: string,
  skip?: number,
  take?: number
) => {
  return await db.thread.findMany({
    where: {
      visitor_id: visitorId,
    },
    orderBy: {
      created_at: 'desc',
    },
    skip: skip,
    take: take,
    select: {
      public_id: true,
      created_at: true,
      visitor_id: true,
      messages: {
        select: {
          content: true,
          created_at: true,
          role: true,
        },
      },
    },
  });
};
