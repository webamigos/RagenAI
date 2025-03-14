import db from '@ragenai/prisma-client';
import { logger } from '../utils/logger';
import { getOrgIdOrThrow } from './clerk';

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
        updated_at: true,
        internal_organization_id: true,
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

//Returns all projects except the default project
export const fetchProjectsForUser = async (
  organizationId: string,
  userId: string
) => {
  try {
    const projects = await db.project.findMany({
      where: {
        organization_id: organizationId, //Default PROJECT is filtered out, organization_id column is NULL
        owner_id: userId,
      },
      select: {
        id: true,
        public_id: true,
        title: true,
        created_at: true,
        organization_id: true,
        threads: {
          orderBy: {
            created_at: 'desc',
          },
          select: {
            id: true,
            public_id: true,
            created_at: true,
            visitor_id: true,
            preferred_communication_type: true,
            project_id: true,
            messages: {
              orderBy: {
                created_at: 'asc',
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

export const getProjectByPublicId = async (publicId: string) => {
  try {
    return await db.project.findFirst({
      where: {
        public_id: publicId,
      },
      select: {
        id: true,
        public_id: true,
        title: true,
        threads: true,
        internal_organization_id: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project by public ID');
    throw error;
  }
};

/**
 * Fetches files associated with a specific project
 */
export const fetchProjectFiles = async (projectId: number) => {
  const orgId = getOrgIdOrThrow();

  return await db.userFile.findMany({
    where: {
      organization_id: orgId,
      project_id: projectId,
    },
    select: {
      created_at: true,
      file_name: true,
      file_size: true,
      file_type: true,
      updated_at: true,
      metadata: true,
      organization_id: true,
      id: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};

/**
 * Deletes a file from a specific project
 */
export const deleteProjectFile = async (fileId: string, projectId: number) => {
  const orgId = getOrgIdOrThrow();
  return await db.userFile.deleteMany({
    where: {
      id: fileId,
      organization_id: orgId,
      project_id: projectId,
    },
  });
};
