'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const toggleChatbotCommand = async (
  projectId: number,
  enabled: boolean,
) => {
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
      where: { id: projectId },
      data: {
        chatbotEnabled: enabled,
      },
    });

    logger.info({ projectId, enabled }, 'Chatbot status updated successfully');
    return { success: true };
  } catch (error) {
    logger.error({ err: error, projectId }, 'Error updating chatbot status');
    return { success: false };
  }
};
