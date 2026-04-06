'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export const renameThreadCommand = async (
  threadPublicId: string,
  title: string,
): Promise<
  { success: true; title: string } | { success: false; errorMessage: string }
> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      return { success: false, errorMessage: 'Unauthorized' };
    }

    const thread = await db.thread.findFirst({
      where: { id: threadPublicId, organizationId: orgId },
    });

    if (!thread) {
      return { success: false, errorMessage: 'Thread not found' };
    }

    await db.thread.update({
      where: { id: threadPublicId },
      data: { title: title.trim() },
    });

    trackAudit({
      action: 'thread.renamed',
      entityType: 'thread',
      entityId: threadPublicId,
      oldData: { title: thread.title },
      newData: { title: title.trim() },
    });

    logger.info({ threadId: threadPublicId, title }, 'Thread renamed');

    return { success: true, title: title.trim() };
  } catch (error) {
    logger.error({ err: error, threadPublicId }, 'Error renaming thread');
    return { success: false, errorMessage: 'Failed to rename thread' };
  }
};
