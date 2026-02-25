'use server';

import { type Project } from '@/generated/prisma/client';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import { findInternalOrganizationQuery as findOrganizationByProviderId } from '@/features/organizations/services/queries/find-internal-organization-query';
import { createProjectCommand as createProjectForOrganization } from '@/features/projects/services/commands/create-project-command';
import { getUserProjectsQuery as fetchProjectsForUser } from '@/features/projects/services/queries/get-user-projects-query';

const serviceName = 'assistants/actions';

type CreateProjectResponse = {
  status: StatusCodes;
  project?: Omit<Project, 'id'>;
  error?: string;
};

export const createProject = async (
  providerOrgId: string,
  title: string,
  userId: string
): Promise<CreateProjectResponse> => {
  try {
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

    logger.info(
      { projectPublicId: project.public_id },
      'Project created successfully'
    );

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
      'Error fetching assistants'
    );
    return {
      error: 'Failed to fetch assistant',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};
