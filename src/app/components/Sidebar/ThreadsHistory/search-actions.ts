'use server';

import db from '@ragenai/prisma-client';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import {
  searchAllQuery,
  type SearchResultItem,
} from '@/features/threads/services/queries/search-all-query';

export async function searchAll(
  visitorId: string,
  query: string,
): Promise<SearchResultItem[]> {
  return searchAllQuery(visitorId, query);
}

export async function getRecentProjects(): Promise<
  { id: string; title: string; createdAt: string }[]
> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const projects = await db.project.findMany({
    where: { organizationId: orgId, ownerId: userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, createdAt: true },
  });

  return projects.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
  }));
}
