'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import type { ThreadContextAction } from '../../contracts/thread.types';

export const removeThreadProjectContextCommand = async (
  publicThreadId: string,
) => {
  try {
    const updatedThread = await db.thread.update({
      where: { id: publicThreadId },
      data: { mentionedProjectId: null },
      select: {
        id: true,
        mentionedProjectId: true,
      },
    });

    logger.info(
      {
        threadId: publicThreadId,
      },
      'Thread project context removed successfully',
    );

    return updatedThread;
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to remove thread context ${publicThreadId}`,
    );
    throw error;
  }
};

export const removeThreadContextCommand = async (
  threadId: string,
): Promise<ThreadContextAction> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      return {
        success: false,
        errorMessage: 'Unauthorized',
      };
    }

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        id: threadId,
        organizationId: orgId,
      },
    });

    if (!thread) {
      return {
        success: false,
        errorMessage: 'Thread not found',
      };
    }

    const updatedThread = await removeThreadProjectContextCommand(threadId);

    logger.info(
      {
        threadId,
        orgId,
      },
      'Thread context removed successfully',
    );

    return {
      success: true,
      mentionedProjectId: updatedThread.mentionedProjectId, // should be null
    };
  } catch (error) {
    logger.error({ err: error, threadId }, 'Error removing thread context');
    return {
      success: false,
      errorMessage: 'Failed to remove thread context',
    };
  }
};
