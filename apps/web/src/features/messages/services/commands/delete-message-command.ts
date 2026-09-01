'use server';

import type { OperationResult } from '@/types/common';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

export async function deleteMessageCommand(
  messagePublicId: string,
): Promise<OperationResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'DELETE',
      path: `/v1/internal/messages/${encodeURIComponent(messagePublicId)}`,
      userId,
      orgId,
    });
  } catch {
    return { success: false, error: 'Failed to delete message' };
  }
}
