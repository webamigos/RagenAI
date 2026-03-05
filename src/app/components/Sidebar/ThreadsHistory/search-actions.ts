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
  { public_id: string; title: string; created_at: string }[]
> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const projects = await db.project.findMany({
    where: { organization_id: orgId, owner_id: userId },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: { public_id: true, title: true, created_at: true },
  });

  return projects.map((p) => ({
    ...p,
    created_at: p.created_at.toISOString(),
  }));
}
