'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const disablePublicAccessCommand = async (publicId: string) => {
  try {
    const orgId = await getOrgIdOrThrow();

    const project = await db.project.findFirst({
      where: {
        public_id: publicId,
        organization_id: orgId,
      },
    });

    if (!project) {
      logger.error({ publicId, orgId }, 'Project not found or unauthorized');
      throw new Error('Project not found or unauthorized');
    }

    await db.project.update({
      where: { id: project.id },
      data: {
        is_public: false,
        access_token: null,
        published_at: null,
      },
    });

    logger.info({ publicId }, 'Public access disabled successfully');
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error disabling public access');
    throw error;
  }
};
