'use server';

import db from '@ragenai/prisma-client';
import { logger } from '../utils/logger';
import { getOrgIdOrThrow } from './clerk';

import crypto from 'crypto';
import { Project, Source } from '@prisma/client';

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

export const fetchOrganizationDefaultProjectPublicId = async (
  clerkOrgId: string
) => {
  const result = await db.organization.findFirst({
    where: {
      provider_id: clerkOrgId,
    },
    select: {
      project: {
        select: {
          public_id: true,
        },
        take: 1,
      },
    },
  });

  return result?.project[0]?.public_id ?? null;
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
        source: Source.UI,
      },
      select: {
        public_id: true,
        title: true,
        created_at: true,
        updated_at: true,
        internal_organization_id: true,
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
      orderBy: {
        created_at: 'desc',
      },
      select: {
        public_id: true,
        title: true,
        created_at: true,
        organization_id: true,
        threads: {
          orderBy: {
            created_at: 'desc',
          },
          select: {
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

export const getProjectByPublicId = async (publicId: Project['public_id']) => {
  try {
    return await getProjectByPublicIdOrThrow(publicId);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project by public ID');
    throw error;
  }
};

export const getProjectByPublicIdOrThrow = async (
  publicId: Project['public_id']
) => {
  return await db.project.findUniqueOrThrow({
    where: {
      public_id: publicId,
    },
    select: {
      id: true,
      public_id: true,
      title: true,
      threads: true,
      internal_organization_id: true,
      is_public: true,
      access_token: true,
      published_at: true,
      chatbot_enabled: true,
      owner_id: true,
    },
  });
};

/**
 * Fetches files associated with a specific project
 */
export const fetchProjectFiles = async (projectPublicId: string) => {
  const orgId = getOrgIdOrThrow();
  const project = await getProjectByPublicIdOrThrow(projectPublicId);

  return await db.userFile.findMany({
    where: {
      organization_id: orgId,
      project_id: project.id,
    },
    select: {
      created_at: true,
      file_name: true,
      file_size: true,
      file_type: true,
      updated_at: true,
      metadata: true,
      organization_id: true,
      public_id: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};

/**
 * Deletes a file from a specific project
 */
export const deleteProjectFile = async (
  publicFileId: string,
  projectPublicId: string
) => {
  const orgId = getOrgIdOrThrow();

  const projectRecord = await getProjectByPublicId(projectPublicId);

  if (!projectRecord) {
    throw new Error('Project not found!');
  }

  return await db.userFile.deleteMany({
    where: {
      public_id: publicFileId,
      organization_id: orgId,
      project_id: projectRecord.id,
    },
  });
};

// TODO: refactor to use public_id
export const getPublicProject = async (publicAccessTokenId: string) => {
  try {
    const project = await db.project.findFirst({
      where: {
        access_token: publicAccessTokenId,
        is_public: true,
      },
      select: {
        organization_id: true,
        id: true,
        title: true,
      },
    });

    if (!project || !project.organization_id) {
      return null;
    }

    return {
      organizationId: project.organization_id,
      projectId: project.id,
      title: project.title,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching public project');
    throw error;
  }
};

// TODO: refactor to use public id
export const generateProjectKey = async (projectId: number) => {
  try {
    logger.info('Generating access token for project');

    // Update project to be public
    const project = await db.project.update({
      where: { id: projectId },
      data: {
        access_token: crypto.randomUUID(),
        is_public: true,
        published_at: new Date(),
      },
      select: {
        access_token: true,
      },
    });

    if (!projectId) {
      throw new Error('Failed to generate access token');
    }

    return {
      accessToken: project.access_token,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error generating access token:');
    throw new Error('Failed to generate access token');
  }
};

// TODO: refactor to use public id
export const disablePublicAccessForProject = async (projectId: number) => {
  try {
    const orgId = getOrgIdOrThrow();

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organization_id: orgId,
      },
    });

    if (!project) {
      logger.error({ projectId, orgId }, 'Project not found or unauthorized');
      throw new Error('Project not found or unauthorized');
    }

    await db.project.update({
      where: { id: projectId },
      data: {
        is_public: false,
        access_token: null,
        published_at: null,
      },
    });

    logger.info({ projectId }, 'Public access disabled successfully');
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error disabling public access');
    throw error;
  }
};

// TODO: refactor to use public id
export const toggleChatbotEnabled = async (
  projectId: number,
  enabled: boolean
) => {
  try {
    const orgId = getOrgIdOrThrow();

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organization_id: orgId,
      },
    });

    if (!project) {
      logger.error({ projectId, orgId }, 'Project not found or unauthorized');
      throw new Error('Project not found or unauthorized');
    }

    await db.project.update({
      where: { id: projectId },
      data: {
        chatbot_enabled: enabled,
      },
    });

    logger.info({ projectId, enabled }, 'Chatbot status updated successfully');
    return { success: true };
  } catch (error) {
    logger.error({ err: error, projectId }, 'Error updating chatbot status');
    return { success: false };
  }
};
