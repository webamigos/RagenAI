'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export const deleteThreadCommand = async (
  threadPublicId: string,
): Promise<{ success: true } | { success: false; errorMessage: string }> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      return { success: false, errorMessage: 'Unauthorized' };
    }

    const thread = await db.thread.findFirst({
      where: { public_id: threadPublicId, organization_id: orgId },
    });

    if (!thread) {
      return { success: false, errorMessage: 'Thread not found' };
    }

    // Delete messages first, then the thread
    await db.message.deleteMany({ where: { thread_id: thread.id } });
    await db.threadDocument.deleteMany({ where: { thread_id: thread.id } });
    await db.thread.delete({ where: { id: thread.id } });

    logger.info({ threadId: threadPublicId }, 'Thread deleted');

    return { success: true };
  } catch (error) {
    logger.error({ err: error, threadPublicId }, 'Error deleting thread');
    return { success: false, errorMessage: 'Failed to delete thread' };
  }
};
