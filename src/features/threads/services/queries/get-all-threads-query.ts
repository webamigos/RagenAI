'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';

const THREAD_SELECT = {
  public_id: true,
  created_at: true,
  is_starred: true,
  title: true,
  project_id: true,
  organization_id: true,
  team_id: true,
  project: { select: { public_id: true, title: true } },
  team: { select: { id: true, name: true } },
  messages: {
    select: { content: true },
    take: 1,
    orderBy: { created_at: 'asc' as const },
  },
} as const;

export const getAllThreadsQuery = async (
  visitorId: string,
  skip = 0,
  take = 20,
  query?: string,
  userTeamIds: string[] = [],
) => {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    logger.error('No orgId found for all threads query');
    return { threads: [], hasMore: false, total: 0 };
  }

  const where = {
    organization_id: orgId,
    messages: query
      ? {
          some: {
            content: { contains: query, mode: 'insensitive' as const },
          },
        }
      : { some: {} },
    OR: [
      { visitor_id: visitorId },
      ...(userTeamIds.length > 0 ? [{ team_id: { in: userTeamIds } }] : []),
    ],
  };

  const [threads, total] = await Promise.all([
    db.thread.findMany({
      where,
      orderBy: [{ is_starred: 'desc' }, { created_at: 'desc' }],
      skip,
      take: take + 1,
      select: THREAD_SELECT,
    }),
    db.thread.count({ where }),
  ]);

  const hasMore = threads.length > take;
  const threadsSlice = hasMore ? threads.slice(0, take) : threads;

  return {
    threads: threadsSlice.map((t) => ({
      ...t,
      created_at: t.created_at.toISOString(),
    })),
    hasMore,
    total,
  };
};
