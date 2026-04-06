'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { shareThreadCommand } from '@/features/threads/services/commands/share-thread-command';
import { getThreadSharesQuery } from '@/features/threads/services/queries/get-thread-shares-query';
import { getSharedThreadsQuery } from '@/features/threads/services/queries/get-shared-threads-query';
import type {
  ThreadShareInfo,
  SidebarThreadItem,
} from '@/features/threads/contracts/thread.types';

export async function shareThreadAction(
  threadId: string,
  recipientUserIds: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  return shareThreadCommand({
    threadId,
    recipientUserIds,
    organizationId: orgId,
    currentUserId: userId,
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

  return getThreadSharesQuery(threadId, orgId, userId);
}

export async function getSharedThreadsAction(): Promise<SidebarThreadItem[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  return getSharedThreadsQuery(userId);
}
