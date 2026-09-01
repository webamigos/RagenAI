'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type {
  ThreadShareInfo,
  SidebarThreadItem,
} from '@/features/threads/contracts/thread.types';

type OperationResult = { success: true } | { success: false; error: string };

export async function shareThreadAction(
  threadId: string,
  recipientUserIds: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  return ragenApiRequest<OperationResult>({
    method: 'POST',
    path: `/v1/internal/threads/${encodeURIComponent(threadId)}/share`,
    userId,
    orgId,
    body: { recipientUserIds },
  });
}

export async function getThreadSharesAction(
  threadId: string,
): Promise<ThreadShareInfo> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return { threadId: threadId, sharedWith: [] };
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  return ragenApiRequest<ThreadShareInfo>({
    method: 'GET',
    path: `/v1/internal/threads/${encodeURIComponent(threadId)}/shares`,
    userId,
    orgId,
  });
}

export async function getSharedThreadsAction(): Promise<SidebarThreadItem[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  return ragenApiRequest<SidebarThreadItem[]>({
    method: 'GET',
    path: '/v1/internal/threads/shared',
    userId,
    orgId,
  });
}
