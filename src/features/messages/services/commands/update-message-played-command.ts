'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';

export const updateMessagePlayedCommand = async (messagePublicId: string) => {
  try {
    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      throw new Error('Unauthorized: organization context required');
    }

    const message = await db.message.findFirst({
      where: {
        public_id: messagePublicId,
        thread: { organization_id: orgId },
      },
      select: { id: true },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    return await db.message.update({
      where: { id: message.id },
      data: {
        voice_played: true,
        message_type: 'VOICE',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update message played status');
    throw error;
  }
};
