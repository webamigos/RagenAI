'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { AllThreadsItem } from '../../contracts/thread.types';

type AllThreadsResult = {
  threads: AllThreadsItem[];
  hasMore: boolean;
  total: number;
};

/**
 * `visitorId` is always the caller's own id at the call site
 * (`getAllThreads(user.id, ...)`), but this is a client-invocable Server
 * Action — never trust it for the auth token. The session-derived userId
 * is used to mint the apps/api session token instead.
 */
export const getAllThreadsQuery = async (
  visitorId: string,
  skip?: number,
  take?: number,
  query?: string,
): Promise<AllThreadsResult> => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { threads: [], hasMore: false, total: 0 };
  }
  return ragenApiRequest<AllThreadsResult>({
    method: 'GET',
    path: '/v1/internal/threads',
    userId,
    orgId,
    query: { skip, take, query },
  });
};
