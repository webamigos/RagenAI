'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';

export const disablePublicAccessCommand = async (projectId: string) => {
  try {
    await requireProjectAccess(projectId, 'owner');

    const project = await db.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    await db.project.update({
      where: { id: project.id },
      data: {
        isPublic: false,
        accessToken: null,
        publishedAt: null,
      },
    });

    logger.info({ projectId }, 'Public access disabled successfully');
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error disabling public access');
    throw error;
  }
};
