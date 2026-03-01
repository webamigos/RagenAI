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
        organization_id: organizationId,
        owner_id: userId,
        source: Source.UI,
      },
      select: {
        public_id: true,
        title: true,
        created_at: true,
        updated_at: true,
        organization_id: true,
        threads: true,
        owner_id: true,
        is_public: true,
        access_token: true,
        published_at: true,
        chatbot_enabled: true,
        source: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating project in database');
    throw error;
  }
};
