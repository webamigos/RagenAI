'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import type { ToggleStarredResult } from '../../contracts/thread.types';

export const toggleThreadStarredCommand = async (
  threadPublicId: string,
  isStarred: boolean,
): Promise<ToggleStarredResult> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      return { success: false, errorMessage: 'Unauthorized' };
    }

    const thread = await db.thread.findFirst({
      where: {
        public_id: threadPublicId,
        organization_id: orgId,
      },
    });

    if (!thread) {
      return { success: false, errorMessage: 'Thread not found' };
    }

    const updated = await db.thread.update({
      where: { public_id: threadPublicId },
      data: { is_starred: isStarred },
      select: { public_id: true, is_starred: true },
    });

    logger.info(
      { threadId: threadPublicId, isStarred },
      'Thread starred status updated',
    );

    return {
      success: true,
      public_id: updated.public_id,
      is_starred: updated.is_starred,
    };
  } catch (error) {
    logger.error(
      { err: error, threadPublicId, isStarred },
      'Error toggling thread starred status',
    );
    return { success: false, errorMessage: 'Failed to update starred status' };
  }
};
