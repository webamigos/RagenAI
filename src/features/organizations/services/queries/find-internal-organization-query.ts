'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const findInternalOrganizationQuery = async (providerId: string) => {
  try {
    return await db.internalOrganization.findUnique({
      where: {
        provider_id: providerId,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error finding organization');
    throw error;
  }
};
