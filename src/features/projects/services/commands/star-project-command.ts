'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';

export async function starProjectCommand(
  projectId: string,
  starred: boolean,
): Promise<{ success: boolean }> {
  try {
    await requireProjectAccess(projectId, 'manage');

    await db.project.update({
      where: { id: projectId },
      data: { isStarred: starred },
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error, projectId, starred }, 'Error starring project');
    throw error;
  }
}
