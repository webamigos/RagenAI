'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const disablePublicAccessCommand = async (projectId: string) => {
  try {
    const orgId = await getOrgIdOrThrow();

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organizationId: orgId,
      },
    });

    if (!project) {
      logger.error({ projectId, orgId }, 'Project not found or unauthorized');
      throw new Error('Project not found or unauthorized');
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
