'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
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
      where: { publicId: threadPublicId, organizationId: orgId },
    });

    if (!thread) {
      return { success: false, errorMessage: 'Thread not found' };
    }

    // Delete messages first, then the thread
    await db.message.deleteMany({ where: { threadId: thread.id } });
    await db.threadDocument.deleteMany({ where: { threadId: thread.id } });
    await db.thread.delete({ where: { id: thread.id } });

    trackAudit({
      action: 'thread.deleted',
      entityType: 'thread',
      entityId: threadPublicId,
      oldData: { title: thread.title },
    });

    logger.info({ threadId: threadPublicId }, 'Thread deleted');

    return { success: true };
  } catch (error) {
    logger.error({ err: error, threadPublicId }, 'Error deleting thread');
    return { success: false, errorMessage: 'Failed to delete thread' };
  }
};
