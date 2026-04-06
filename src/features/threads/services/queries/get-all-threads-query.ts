'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';

const THREAD_SELECT = {
  id: true,
  createdAt: true,
  isStarred: true,
  title: true,
  projectId: true,
  organizationId: true,
  teamId: true,
  project: { select: { id: true, title: true } },
  team: { select: { id: true, name: true } },
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
    organizationId: orgId,
    ...(query
      ? { title: { contains: query, mode: 'insensitive' as const } }
      : {}),
    messages: { some: {} },
    OR: [
      { visitorId: visitorId },
      ...(userTeamIds.length > 0 ? [{ teamId: { in: userTeamIds } }] : []),
    ],
  };

  const [threads, total] = await Promise.all([
    db.thread.findMany({
      where,
      orderBy: [{ isStarred: 'desc' }, { createdAt: 'desc' }],
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
      createdAt: t.createdAt.toISOString(),
    })),
    hasMore,
    total,
  };
};
