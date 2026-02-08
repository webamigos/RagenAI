import { Message } from '@/generated/prisma/client';
import { startOfDay, setHours } from 'date-fns';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '../utils/auth-helpers';
import { fetchOrganizationDefaultProjectId } from './project';
import { logger } from '../utils/logger';

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
  take?: number,
  query?: string
) => {
  //Remove the restriction to the last 30 days in the future if it is no longer required.
  //the constraint is only supported when query is defined
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const orgId = await getOrgIdFromAuthOrThrow();
  const defaultProjectId = await fetchOrganizationDefaultProjectId(orgId);

  if (!defaultProjectId) {
    logger.error({ orgId }, 'Default project ID does not exist!');
    throw new Error('Default project ID does not exist!');
  }

  const threads = await db.thread.findMany({
    where: {
      visitor_id: visitorId,
      project_id: defaultProjectId,
      messages: query
        ? {
            some: {
              created_at: {
                gte: thirtyDaysAgo,
              },
              content: {
                contains: query,
                mode: 'insensitive',
              },
            },
          }
        : {
            some: {},
          },
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
      project_id: true,
      messages: {
        select: {
          content: true,
          created_at: true,
          role: true,
        },
      },
    },
  });

  // Convert Date objects to ISO strings for Redux serialization
  return threads.map((thread) => ({
    ...thread,
    created_at: thread.created_at.toISOString(),
    messages: thread.messages.map((msg) => ({
      ...msg,
      created_at: msg.created_at.toISOString(),
    })),
  }));
};
