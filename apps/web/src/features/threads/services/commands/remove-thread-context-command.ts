'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

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
