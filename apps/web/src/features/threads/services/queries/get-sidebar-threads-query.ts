'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { SidebarThreadItem } from '../../contracts/thread.types';

type SidebarThreadsResult = {
  starred: SidebarThreadItem[];
  recent: SidebarThreadItem[];
  hasMore: boolean;
};

/**
 * `visitorId` is always the caller's own id in the panel-UI call sites
 * (`getSidebarThreads(user.id, ...)`), but this is a client-invocable
 * Server Action — never trust it for the auth token. The session-derived
 * userId is used to mint the apps/api session token instead.
 */
export const getSidebarThreadsQuery = async (
  visitorId: string,
  recentLimit?: number,
  recentSkip?: number,
): Promise<SidebarThreadsResult> => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { starred: [], recent: [], hasMore: false };
  }
  return ragenApiRequest<SidebarThreadsResult>({
    method: 'GET',
    path: '/v1/internal/threads/sidebar',
    userId,
    orgId,
    query: { recentLimit, recentSkip },
  });
};
