'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

type RenameThreadResult =
  { success: true; title: string } | { success: false; errorMessage: string };

export const renameThreadCommand = async (
  threadId: string,
  title: string,
): Promise<RenameThreadResult> => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, errorMessage: 'Unauthorized' };
  }
  try {
    return await ragenApiRequest<RenameThreadResult>({
      method: 'PUT',
      path: `/v1/internal/threads/${encodeURIComponent(threadId)}/rename`,
      userId,
      orgId,
      body: { title },
    });
  } catch {
    return { success: false, errorMessage: 'Failed to rename thread' };
  }
};
