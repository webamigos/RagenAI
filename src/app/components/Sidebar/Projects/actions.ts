'use server';

import { type Project } from '@/generated/prisma/client';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import { createProjectCommand as createProjectForOrganization } from '@/features/projects/services/commands/create-project-command';
import { getUserProjectsQuery as fetchProjectsForUser } from '@/features/projects/services/queries/get-user-projects-query';
import { renameProjectCommand } from '@/features/projects/services/commands/rename-project-command';
import { archiveProjectCommand } from '@/features/projects/services/commands/archive-project-command';
import { starProjectCommand } from '@/features/projects/services/commands/star-project-command';
import { deleteProjectCommand } from '@/features/projects/services/commands/delete-project-command';
import {
  getOrgIdFromAuth,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';

type CreateProjectResponse = {
  status: StatusCodes;
  project?: Project;
  error?: string;
};

export const createProject = async (
  _providerOrgId: string,
  title: string,
  _userId: string,
): Promise<CreateProjectResponse> => {
  try {
    const orgId = await getOrgIdFromAuth();
    const userId = await getCurrentUserId();

    if (!orgId || !userId) {
      return {
        error: 'Unauthorized',
        status: StatusCodes.UNAUTHORIZED,
      };
    }

    const project = await createProjectForOrganization(title, orgId, userId);

    logger.info({ projectId: project.id }, 'Project created successfully');

    return {
      project,
      status: StatusCodes.CREATED,
    };
  } catch (error) {
    logger.error({ err: error, title }, 'Error creating project');
    return {
      error: 'Failed to create project',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};

export const getProjects = async (_organizationId: string, _userId: string) => {
  try {
    const orgId = await getOrgIdFromAuth();
    const userId = await getCurrentUserId();

    if (!orgId || !userId) {
      return {
        error: 'Unauthorized',
        status: StatusCodes.UNAUTHORIZED,
      };
    }

    logger.info(
      { organizationId: orgId, userId },
      'Getting projects for organization',
    );

    const projects = await fetchProjectsForUser(orgId, userId);

    logger.info({ count: projects.length }, 'Successfully fetched projects');

    return {
      projects,
      status: StatusCodes.OK,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching assistants');
    return {
      error: 'Failed to fetch assistant',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};

export const renameProjectAction = async (projectId: string, title: string) => {
  try {
    return await renameProjectCommand(projectId, title);
  } catch (error) {
    logger.error({ err: error, projectId }, 'renameProjectAction failed');
    return { success: false, error: 'Failed to rename assistant' };
  }
};

export const archiveProjectAction = async (
  projectId: string,
  archived: boolean,
) => {
  try {
    return await archiveProjectCommand(projectId, archived);
  } catch (error) {
    logger.error({ err: error, projectId }, 'archiveProjectAction failed');
    return { success: false };
  }
};

export const starProjectAction = async (
  projectId: string,
  starred: boolean,
) => {
  try {
    return await starProjectCommand(projectId, starred);
  } catch (error) {
    logger.error({ err: error, projectId }, 'starProjectAction failed');
    return { success: false };
  }
};

export const deleteProjectAction = async (projectId: string) => {
  try {
    return await deleteProjectCommand(projectId);
  } catch (error) {
    logger.error({ err: error, projectId }, 'deleteProjectAction failed');
    return { success: false };
  }
};
