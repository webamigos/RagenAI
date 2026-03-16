'use server';

import db from '@ragenai/prisma-client';
import { Source } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

export const createProjectCommand = async (
  title: string,
  organizationId: string,
  userId: string,
) => {
  try {
    return await db.project.create({
      data: {
        title,
        organizationId: organizationId,
        ownerId: userId,
        source: Source.UI,
      },
      select: {
        publicId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
        threads: true,
        ownerId: true,
        isPublic: true,
        accessToken: true,
        publishedAt: true,
        chatbotEnabled: true,
        source: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating project in database');
    throw error;
  }
};
