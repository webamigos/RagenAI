import db from '@ragenai/prisma-client';
import { logger } from '../utils/logger';

export const fetchOrganizationDefaultProjectId = async (clerkOrgId: string) => {
  const result = await db.organization.findFirst({
    where: {
      provider_id: clerkOrgId,
    },
    select: {
      project: {
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  return result?.project[0]?.id ?? null;
};

export const findOrganizationByProviderId = async (providerId: string) => {
  try {
    return await db.organization.findUnique({
      where: {
        provider_id: providerId,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error finding organization');
    throw error;
  }
};

export const createProjectForOrganization = async (
  organizationId: number,
  title: string
) => {
  try {
    return await db.project.create({
      data: {
        title,
        internal_organization_id: organizationId,
      },
      select: {
        id: true,
        public_id: true,
        title: true,
        created_at: true,
        internal_organization_id: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating project in database');
    throw error;
  }
};
