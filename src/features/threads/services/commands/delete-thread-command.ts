'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

type DeleteThreadResult =
  | { success: true }
  | { success: false; errorMessage: string };

export const deleteThreadCommand = async (
  threadId: string,
): Promise<DeleteThreadResult> => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, errorMessage: 'Unauthorized' };
  }
  try {
    return await ragenApiRequest<DeleteThreadResult>({
      method: 'DELETE',
      path: `/v1/internal/threads/${encodeURIComponent(threadId)}`,
      userId,
      orgId,
    });
  } catch {
    return { success: false, errorMessage: 'Failed to delete thread' };
  }
};
