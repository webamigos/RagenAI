'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getDefaultProjectIdQuery as fetchOrganizationDefaultProjectId } from '@/features/projects/services/queries/get-default-project-query';
import { logger } from '@/app/lib/utils/logger';

export const getUserThreadsQuery = async (
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
