'use server';

import { type Project } from '@/generated/prisma/client';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import { createProjectCommand as createProjectForOrganization } from '@/features/projects/services/commands/create-project-command';
import { getUserProjectsQuery as fetchProjectsForUser } from '@/features/projects/services/queries/get-user-projects-query';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';

type CreateProjectResponse = {
  status: StatusCodes;
  project?: Omit<Project, 'id'>;
  error?: string;
};

export const createProject = async (
  _providerOrgId: string,
  title: string,
  _userId: string,
): Promise<CreateProjectResponse> => {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();

    if (!userId) {
      return {
        error: 'Unauthorized',
        status: StatusCodes.UNAUTHORIZED,
      };
    }

    const project = await createProjectForOrganization(title, orgId, userId);

    logger.info(
      { projectPublicId: project.public_id },
      'Project created successfully',
    );

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
    const orgId = await getOrgIdFromAuthOrThrow();
    const userId = await getCurrentUserId();

    if (!userId) {
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
