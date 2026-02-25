'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const updateMessagePlayedCommand = async (messagePublicId: string) => {
  try {
    return await db.message.update({
      where: {
        public_id: messagePublicId,
      },
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
