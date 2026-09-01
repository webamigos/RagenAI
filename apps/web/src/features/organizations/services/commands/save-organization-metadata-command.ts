'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { OrganizationPublicMetadata } from '../../contracts/organization.types';

export const saveOrganizationPublicMetadataCommand = async (
  organizationId: string,
  { hasKnowledge }: OrganizationPublicMetadata,
) => {
  try {
    await db.organization.update({
      where: { id: organizationId },
      data: { hasKnowledge },
    });

    logger.info(
      { organizationId, hasKnowledge },
      'Organization metadata saved',
    );
  } catch (error) {
    logger.error(
      { error },
      `Error: cannot update public metadata for organization ${organizationId}:`,
    );
  }
};
