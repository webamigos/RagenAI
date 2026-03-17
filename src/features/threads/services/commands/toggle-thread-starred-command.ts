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
        publicId: threadPublicId,
        organizationId: orgId,
      },
    });

    if (!thread) {
      return { success: false, errorMessage: 'Thread not found' };
    }

    const updated = await db.thread.update({
      where: { publicId: threadPublicId },
      data: { isStarred: isStarred },
      select: { publicId: true, isStarred: true },
    });

    logger.info(
      { threadId: threadPublicId, isStarred },
      'Thread starred status updated',
    );

    return {
      success: true,
      publicId: updated.publicId,
      isStarred: updated.isStarred,
    };
  } catch (error) {
    logger.error(
      { err: error, threadPublicId, isStarred },
      'Error toggling thread starred status',
    );
    return { success: false, errorMessage: 'Failed to update starred status' };
  }
};
