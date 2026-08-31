'use server';

import type { OperationResult } from '@/types/common';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

export async function rateMessageCommand(
  messagePublicId: string,
  feedback: 'up' | 'down',
): Promise<OperationResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'POST',
      path: `/v1/internal/messages/${encodeURIComponent(messagePublicId)}/rate`,
      userId,
      orgId,
      body: { feedback },
    });
  } catch {
    return { success: false, error: 'Failed to rate message' };
  }
}
