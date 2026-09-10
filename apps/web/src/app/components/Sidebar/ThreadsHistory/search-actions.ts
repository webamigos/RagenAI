'use server';

import db from '@ragenai/prisma-client';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { SearchResultItem } from '@/features/threads/services/queries/search-all-query';
import {
  searchDocumentsQuery,
  type DocumentSearchResult,
} from '@/features/documents/services/queries/search-documents-query';

export async function searchAll(
  visitorId: string,
  query: string,
): Promise<SearchResultItem[]> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  return ragenApiRequest<SearchResultItem[]>({
    method: 'GET',
    path: '/v1/internal/threads/search-all',
    userId,
    orgId,
    query: { query },
  });
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

/**
 * Files whose name matches, for the palette's Documents group.
 *
 * A web-local query rather than a call through apps/api like `searchAll`.
 * Two reasons: the access predicate it must run (`fileAccessWhere`) lives
 * here, and a new field on an apps/api route is a deployment-ordering problem
 * — that path validates with `forbidNonWhitelisted`, so web and api have to
 * move together. Nothing about searching file names needs to cross that line.
 */
export async function searchDocuments(
  query: string,
): Promise<DocumentSearchResult[]> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  return searchDocumentsQuery(orgId, query);
}
