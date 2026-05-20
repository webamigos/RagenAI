'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';

export async function archiveProjectCommand(
  projectId: string,
  archived: boolean,
): Promise<{ success: boolean }> {
  try {
    await requireProjectAccess(projectId, 'manage');

    await db.project.update({
      where: { id: projectId },
      data: {
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
      },
    });

    return { success: true };
  } catch (error) {
    logger.error(
      { err: error, projectId, archived },
      'Error archiving project',
    );
    throw error;
  }
}
