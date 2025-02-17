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
  organizationInternalId: number,
  title: string,
  organizationId: string,
  userId: string
) => {
  try {
    return await db.project.create({
      data: {
        title,
        internal_organization_id: organizationInternalId,
        organization_id: organizationId,
        owner_id: userId,
      },
      select: {
        id: true,
        public_id: true,
        title: true,
        created_at: true,
        organization_id: true,
        threads: true,
        owner_id: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating project in database');
    throw error;
  }
};

export const fetchProjectsForUser = async (
  organizationId: string,
  userId: string
) => {
  try {
    const projects = await db.project.findMany({
      where: {
        organization_id: organizationId,
        owner_id: userId,
      },
      select: {
        id: true,
        public_id: true,
        title: true,
        created_at: true,
        organization_id: true,
        threads: {
          select: {
            id: true,
            public_id: true,
            openai_thread_id: true,
            created_at: true,
            visitor_id: true,
            preferred_communication_type: true,
            project_id: true,
            messages: {
              take: 1,
              orderBy: {
                created_at: 'desc',
              },
              select: {
                content: true,
              },
            },
          },
        },
      },
    });

    return projects;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching projects for user');
    throw error;
  }
};
