'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const deleteDriveSyncCommand = async (
  organizationId: string,
  syncId: string,
) => {
  try {
    await db.googleDriveSync.delete({
      where: {
        id: syncId,
        organizationId,
      },
    });
    return { success: true as const };
  } catch (error) {
    logger.error({ err: error, syncId }, 'Error deleting Drive sync');
    return { success: false as const, error: 'Failed to delete sync' };
  }
};
