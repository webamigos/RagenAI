'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { ToggleStarredResult } from '../../contracts/thread.types';

export const toggleThreadStarredCommand = async (
  threadId: string,
  isStarred: boolean,
): Promise<ToggleStarredResult> => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, errorMessage: 'Unauthorized' };
  }
  try {
    return await ragenApiRequest<ToggleStarredResult>({
      method: 'POST',
      path: `/v1/internal/threads/${encodeURIComponent(threadId)}/${isStarred ? 'star' : 'unstar'}`,
      userId,
      orgId,
    });
  } catch {
    return { success: false, errorMessage: 'Failed to update starred status' };
  }
};
