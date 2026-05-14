'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { requireProjectAccess } from '../utils/require-project-access';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { UnauthorizedException } from '@/libs/utils/errors';

export const toggleChatbotCommand = async (
  projectId: string,
  enabled: boolean,
) => {
  try {
    const { orgId } = await requireProjectAccess(projectId, 'owner');

    if (enabled) {
      const canChatbot = await isFeatureEnabledQuery(orgId, 'publicChatbot');
      if (!canChatbot) {
        throw new UnauthorizedException(
          'Public chatbot is not enabled for your organization plan',
        );
      }
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
