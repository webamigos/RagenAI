'use server';

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
  fetchOrganizationDefaultProjectId,
} from '@/app/lib/services/project';

const serviceName = 'projects/actions';

type Project = {
  id: number;
  public_id: string;
  title: string;
  created_at: Date;
  organization_id: number;
};

type CreateProjectResponse = {
  status: StatusCodes;
  project?: Project;
  error?: string;
};

export const createProject = async (
  providerOrgId: string,
  title: string
): Promise<CreateProjectResponse> => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(providerOrgId);
    setSentryContext('EXTRA_DATA', {
      title,
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

    // Check if organization already has a default project
    const defaultProjectId = await fetchOrganizationDefaultProjectId(
      providerOrgId
    );

    // If this is the first project, create it
    if (!defaultProjectId) {
      const project = await createProjectForOrganization(
        organization.id,
        title
      );

      logger.info(
        { projectId: project.id },
        'Default project created successfully'
      );

      return {
        project: project as Project,
        status: StatusCodes.CREATED,
      };
    }

    // If organization already has a project, we can either:
    // Option 1: Return an error
    return {
      error: 'Organization already has a default project',
      status: StatusCodes.CONFLICT,
    };

    // Option 2: Allow creating additional projects (uncomment if this is the desired behavior)
    // const project = await createProjectForOrganization(organization.id, title);
    // logger.info({ projectId: project.id }, 'Additional project created successfully');
    // return {
    //   project: project as Project,
    //   status: StatusCodes.CREATED,
    // };
  } catch (error) {
    logger.error(
      { err: error, providerOrgId, title },
      'Error creating project'
    );
    return {
      error: 'Failed to create project',
      status: StatusCodes.INTERNAL_SERVER_ERROR,
    };
  }
};
