'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';

const MAX_TITLE_LENGTH = 120;

export async function renameProjectCommand(
  projectId: string,
  title: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = title.trim();
  if (!trimmed) {
    return { success: false, error: 'Title is required' };
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return { success: false, error: 'Title is too long' };
  }

  try {
    await requireProjectAccess(projectId, 'manage');

    await db.project.update({
      where: { id: projectId },
      data: { title: trimmed },
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error, projectId }, 'Error renaming project');
    throw error;
  }
}
