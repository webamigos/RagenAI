'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { ClerkOrganizationMetadata } from '../../contracts/organization.types';

export const getOrganizationMetadataQuery = async (
  organizationId: string
): Promise<ClerkOrganizationMetadata> => {
  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        hasKnowledge: true,
        vectorStore: true,
        ragenOrgId: true,
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
      privateMetadata: {
        vector_store: org.vectorStore || undefined,
        ragen_org_id: org.ragenOrgId || undefined,
      },
    } as ClerkOrganizationMetadata;
  } catch (error) {
    logger.error(
      { err: error },
      `Error: cannot get private metadata for organization ${organizationId}:`
    );
    return {
      publicMetadata: undefined,
      privateMetadata: undefined,
    };
  }
};
