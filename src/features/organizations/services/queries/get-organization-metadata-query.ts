'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { OrganizationMetadata } from '../../contracts/organization.types';

export const getOrganizationMetadataQuery = async (
  organizationId: string,
): Promise<OrganizationMetadata> => {
  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        hasKnowledge: true,
        vectorStore: true,
      },
    });

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    logger.info({ organizationId }, 'Organization metadata retrieved');
    return {
      publicMetadata: {
        hasKnowledge: org.hasKnowledge,
      },
      vectorStore: org.vectorStore || undefined,
    } as OrganizationMetadata;
  } catch (error) {
    logger.error(
      { err: error },
      `Error: cannot get private metadata for organization ${organizationId}:`,
    );
    return {
      publicMetadata: undefined,
      vectorStore: undefined,
    };
  }
};
