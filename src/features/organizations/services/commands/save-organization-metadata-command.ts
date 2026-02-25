'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type {
  ClerkOrganizationMetadata,
  ClerkOrganizationPublicMetadata,
} from '../../contracts/organization.types';

export const saveOrganizationPublicMetadataCommand = async (
  organizationId: string,
  { hasKnowledge }: ClerkOrganizationPublicMetadata
) => {
  try {
    await db.organization.update({
      where: { id: organizationId },
      data: { hasKnowledge },
    });

    logger.info(
      { organizationId, hasKnowledge },
      'Organization metadata saved'
    );
  } catch (error) {
    logger.error(
      { error },
      `Error: cannot update public metadata for organization ${organizationId}:`
    );
  }
};

export const saveOrganizationInitialMetadataCommand = async (
  organizationId: string,
  { publicMetadata, privateMetadata }: ClerkOrganizationMetadata
) => {
  try {
    await db.organization.update({
      where: { id: organizationId },
      data: {
        hasKnowledge: publicMetadata?.hasKnowledge,
        vectorStore: privateMetadata?.vector_store,
        ragenOrgId: privateMetadata?.ragen_org_id?.toString(),
      },
    });

    logger.info(
      { organizationId, publicMetadata, privateMetadata },
      'Organization initial metadata saved'
    );
  } catch (error) {
    logger.error(
      { error },
      `Error: cannot update private metadata for organization ${organizationId}:`
    );
  }
};
