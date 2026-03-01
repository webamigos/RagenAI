'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const saveUserMetadataCommand = async (
  userId: string,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> => {
  if (!userId || typeof userId !== 'string') {
    return { success: false, error: 'Invalid userId' };
  }

  try {
    // Update User table with metadata
    await db.user.update({
      where: { id: userId },
      data: {
        onboardingComplete: metadata.onboardingComplete as boolean | undefined,
        viewMode: metadata.viewMode as string | undefined,
      },
    });

    logger.info({ userId, metadata }, 'User metadata saved');
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error saving user metadata');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
