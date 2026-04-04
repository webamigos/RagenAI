// Visitor-specific infrastructure functions stay here
// getUserThreads moved to @/features/threads/

import { type Message } from '@/generated/prisma/client';
import { startOfDay, setHours } from 'date-fns';

import db from '@ragenai/prisma-client';

function getMidnightToday(): Date {
  return setHours(startOfDay(new Date()), 0);
}

export const createVisitorEntry = async (
  message: Message,
  visitorId: string,
) => {
  return await db.visitorMessages.create({
    data: {
      messageId: message.publicId,
      visitorId: visitorId,
    },
  });
};

export const getLast24hVisitorMessages = async (
  visitorId: string,
): Promise<number> => {
  return await db.visitorMessages.count({
    where: {
      AND: [
        {
          visitorId: visitorId,
        },
        {
          createdAt: {
            gte: getMidnightToday(),
          },
        },
      ],
    },
  });
};

export const clearVisitorMessages = async () => {
  return await db.visitorMessages.deleteMany({
    where: {
      createdAt: {
        gte: getMidnightToday(),
      },
    },
  });
};

/** @deprecated Use getUserThreadsQuery from @/features/threads instead */
export { getUserThreadsQuery as getUserThreads } from '@/features/threads/services/queries/get-user-threads-query';
