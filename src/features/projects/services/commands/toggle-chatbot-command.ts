'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';

export const toggleChatbotCommand = async (
  projectId: string,
  enabled: boolean,
) => {
  try {
    await requireProjectAccess(projectId, 'owner');

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
