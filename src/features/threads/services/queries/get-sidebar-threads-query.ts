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
  teamId: true,
  project: { select: { id: true, title: true } },
  team: { select: { id: true, name: true } },
} as const;

export const getSidebarThreadsQuery = async (
  visitorId: string,
  recentLimit = 20,
  recentSkip = 0,
  userTeamIds: string[] = [],
) => {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    logger.error('No orgId found for sidebar threads');
    return { starred: [], recent: [], hasMore: false };
  }

  const baseWhere = {
    organizationId: orgId,
    messages: { some: {} },
    OR: [
      { visitorId: visitorId },
      ...(userTeamIds.length > 0 ? [{ teamId: { in: userTeamIds } }] : []),
    ],
  };

  const [starred, recent, _totalRecent] = await Promise.all([
    db.thread.findMany({
      where: { ...baseWhere, isStarred: true },
      orderBy: { createdAt: 'desc' },
      select: THREAD_SELECT,
    }),
    db.thread.findMany({
      where: { ...baseWhere, isStarred: false },
      orderBy: { createdAt: 'desc' },
      skip: recentSkip,
      take: recentLimit + 1,
      select: THREAD_SELECT,
    }),
    db.thread.count({
      where: { ...baseWhere, isStarred: false },
    }),
  ]);

  const hasMore = recent.length > recentLimit;
  const recentSlice = hasMore ? recent.slice(0, recentLimit) : recent;

  const serialize = (threads: typeof starred) =>
    threads.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    }));

  return {
    starred: serialize(starred),
    recent: serialize(recentSlice),
    hasMore,
  };
};
