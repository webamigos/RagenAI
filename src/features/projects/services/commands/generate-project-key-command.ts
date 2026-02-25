'use server';

import crypto from 'crypto';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const generateProjectKeyCommand = async (projectId: number) => {
  try {
    logger.info('Generating access token for project');

    // Update project to be public
    const project = await db.project.update({
      where: { id: projectId },
      data: {
        access_token: crypto.randomUUID(),
        is_public: true,
        published_at: new Date(),
      },
      select: {
        access_token: true,
      },
    });

    if (!projectId) {
      throw new Error('Failed to generate access token');
    }

    return {
      accessToken: project.access_token,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error generating access token:');
    throw new Error('Failed to generate access token');
  }
};
