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
  project: { select: { public_id: true, title: true } },
  messages: {
    select: { content: true },
    take: 1,
    orderBy: { created_at: 'asc' as const },
  },
} as const;

export const getSidebarThreadsQuery = async (
  visitorId: string,
  recentLimit = 20,
  recentSkip = 0,
) => {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    logger.error('No orgId found for sidebar threads');
    return { starred: [], recent: [], hasMore: false };
  }

  const baseWhere = {
    visitor_id: visitorId,
    organization_id: orgId,
    messages: { some: {} },
  };

  const [starred, recent, _totalRecent] = await Promise.all([
    db.thread.findMany({
      where: { ...baseWhere, is_starred: true },
      orderBy: { created_at: 'desc' },
      select: THREAD_SELECT,
    }),
    db.thread.findMany({
      where: { ...baseWhere, is_starred: false },
      orderBy: { created_at: 'desc' },
      skip: recentSkip,
      take: recentLimit + 1,
      select: THREAD_SELECT,
    }),
    db.thread.count({
      where: { ...baseWhere, is_starred: false },
    }),
  ]);

  const hasMore = recent.length > recentLimit;
  const recentSlice = hasMore ? recent.slice(0, recentLimit) : recent;

  const serialize = (threads: typeof starred) =>
    threads.map((t) => ({
      ...t,
      created_at: t.created_at.toISOString(),
    }));

  return {
    starred: serialize(starred),
    recent: serialize(recentSlice),
    hasMore,
  };
};
