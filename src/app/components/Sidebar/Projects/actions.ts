'use server';

import { type Project } from '@/generated/prisma/client';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import {
  getOrgIdFromAuth,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import { type ProjectType } from '@/app/components/Sidebar/Projects/types';

type OperationResult = { success: boolean; error?: string };

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

    const project = await ragenApiRequest<Project>({
      method: 'POST',
      path: '/v1/internal/projects',
      userId,
      orgId,
      body: { title },
    });

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

    const projects = await ragenApiRequest<ProjectType[]>({
      method: 'GET',
      path: '/v1/internal/projects',
      userId,
      orgId,
    });

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
  const [orgId, userId] = await Promise.all([
    getOrgIdFromAuth(),
    getCurrentUserId(),
  ]);
  if (!orgId || !userId) {
    return { success: false, error: 'Not authenticated' };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'PUT',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/rename`,
      userId,
      orgId,
      body: { title },
    });
  } catch (error) {
    logger.error({ err: error, projectId }, 'renameProjectAction failed');
    return { success: false, error: 'Failed to rename assistant' };
  }
};

export const archiveProjectAction = async (
  projectId: string,
  archived: boolean,
) => {
  const [orgId, userId] = await Promise.all([
    getOrgIdFromAuth(),
    getCurrentUserId(),
  ]);
  if (!orgId || !userId) {
    return { success: false };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'POST',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/${archived ? 'archive' : 'unarchive'}`,
      userId,
      orgId,
    });
  } catch (error) {
    logger.error({ err: error, projectId }, 'archiveProjectAction failed');
    return { success: false };
  }
};

export const starProjectAction = async (
  projectId: string,
  starred: boolean,
) => {
  const [orgId, userId] = await Promise.all([
    getOrgIdFromAuth(),
    getCurrentUserId(),
  ]);
  if (!orgId || !userId) {
    return { success: false };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'POST',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/${starred ? 'star' : 'unstar'}`,
      userId,
      orgId,
    });
  } catch (error) {
    logger.error({ err: error, projectId }, 'starProjectAction failed');
    return { success: false };
  }
};

export const deleteProjectAction = async (projectId: string) => {
  const [orgId, userId] = await Promise.all([
    getOrgIdFromAuth(),
    getCurrentUserId(),
  ]);
  if (!orgId || !userId) {
    return { success: false };
  }
  try {
    return await ragenApiRequest<OperationResult>({
      method: 'DELETE',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}`,
      userId,
      orgId,
    });
  } catch (error) {
    logger.error({ err: error, projectId }, 'deleteProjectAction failed');
    return { success: false };
  }
};
