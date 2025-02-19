'use server';

import { type Project } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import {
  setSentryServiceTag,
  setSentryClerkOrganizationTag,
  setSentryContext,
} from '@/app/lib/services/sentry';
import {
  findOrganizationByProviderId,
  createProjectForOrganization,
  fetchProjectsForUser,
} from '@/app/lib/services/project';

const serviceName = 'projects/actions';

type CreateProjectResponse = {
  status: StatusCodes;
  project?: Project;
  error?: string;
};

export const createProject = async (
  providerOrgId: string,
  title: string,
  userId: string
): Promise<CreateProjectResponse> => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(providerOrgId);
    setSentryContext('EXTRA_DATA', {
      title,
      userId,
    });

    const organization = await findOrganizationByProviderId(providerOrgId);

    if (!organization) {
      logger.error(
        { providerOrgId },
        'Organization not found when creating project'
      );
      return {
        error: 'Organization not found',
        status: StatusCodes.NOT_FOUND,
      };
    }

    const project = await createProjectForOrganization(
      organization.id,
      title,
      providerOrgId,
      userId
    );

    logger.info({ projectId: project.id }, 'Project created successfully');

    return {
      project,
      status: StatusCodes.CREATED,
    };
  } catch (error) {
    logger.error(
      { err: error, providerOrgId, title, userId },
      'Error creating project'
    );
    return {
      error: 'Failed to create project',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};

export const getProjects = async (organizationId: string, userId: string) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(organizationId);
    setSentryContext('EXTRA_DATA', {
      userId,
    });

    logger.info(
      { organizationId, userId },
      'Getting projects from Clerk organization'
    );

    const projects = await fetchProjectsForUser(organizationId, userId);

    logger.info({ count: projects.length }, 'Successfully fetched projects');

    return {
      projects,
      status: StatusCodes.OK,
    };
  } catch (error) {
    logger.error(
      { err: error, organizationId, userId },
      'Error fetching projects'
    );
    return {
      error: 'Failed to fetch projects',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};
