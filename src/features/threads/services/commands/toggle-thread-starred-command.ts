'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import type { ToggleStarredResult } from '../../contracts/thread.types';

export const toggleThreadStarredCommand = async (
  threadId: string,
  isStarred: boolean,
): Promise<ToggleStarredResult> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      return { success: false, errorMessage: 'Unauthorized' };
    }

    const thread = await db.thread.findFirst({
      where: {
        id: threadId,
        organizationId: orgId,
      },
    });

    if (!thread) {
      return { success: false, errorMessage: 'Thread not found' };
    }

    const updated = await db.thread.update({
      where: { id: threadId },
      data: { isStarred: isStarred },
      select: { id: true, isStarred: true },
    });

    logger.info(
      { threadId: threadId, isStarred },
      'Thread starred status updated',
    );

    return {
      success: true,
      id: updated.id,
      isStarred: updated.isStarred,
    };
  } catch (error) {
    logger.error(
      { err: error, threadId, isStarred },
      'Error toggling thread starred status',
    );
    return { success: false, errorMessage: 'Failed to update starred status' };
  }
};
