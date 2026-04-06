'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const deleteDriveSyncCommand = async (
  organizationId: string,
  syncId: string,
) => {
  try {
    const sync = await db.googleDriveSync.findFirst({
      where: { id: syncId, organizationId },
      select: { id: true },
    });
    if (!sync) {
      return { success: false as const, error: 'Sync not found' };
    }
    await db.googleDriveSync.delete({
      where: { id: sync.id },
    });
    return { success: true as const };
  } catch (error) {
    logger.error({ err: error, syncId }, 'Error deleting Drive sync');
    return { success: false as const, error: 'Failed to delete sync' };
  }
};
