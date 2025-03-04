import { getRedisInstance } from './redis';
import { logger } from '../utils/logger';
import db from '@ragenai/prisma-client';

const redis = getRedisInstance();

async function getProjectInfo(projectId: string) {
  try {
    logger.info(`Attempting to find project with public_id: ${projectId}`);

    if (!projectId) {
      logger.error('Project ID is empty or undefined');
      return null;
    }

    const project = await db.project.findUnique({
      where: {
        public_id: projectId,
      },
      select: {
        id: true,
        public_id: true,
        organization_id: true,
      },
    });

    logger.info({ projectResult: project }, 'Project search result');

    return project;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project info');
    throw new Error('Failed to fetch project info');
  }
}

function createProjectRedisKey(organizationId: string): string {
  return `org:${organizationId}`;
}

export async function saveProjectInstruction(
  projectId: string,
  instruction: string
): Promise<{ success: boolean; status: string }> {
  try {
    if (!projectId) {
      logger.error('Project ID is missing');
      return { success: false, status: 'Project ID is required' };
    }

    const project = await getProjectInfo(projectId);

    if (!project) {
      logger.error({ projectId }, 'Project not found in database');
      return { success: false, status: 'Project not found' };
    }

    if (!project.organization_id) {
      logger.error({ project }, 'Organization ID is missing from project');
      return {
        success: false,
        status: 'Organization ID not found for this project',
      };
    }

    const redisKey = createProjectRedisKey(project.organization_id);

    logger.info(
      { redisKey, projectPublicId: project.public_id },
      'Attempting to save to Redis'
    );
    return await redis.hsetWithStatus(redisKey, {
      [project.public_id]: instruction,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error saving project instruction');
    return { success: false, status: 'Failed to save project instruction' };
  }
}

export async function getProjectInstruction(
  projectId: string
): Promise<string | null> {
  try {
    logger.info({ projectId }, 'getProjectInstruction called');

    if (!projectId) {
      logger.error('Project ID is missing');
      return null;
    }

    const project = await getProjectInfo(projectId);

    if (!project) {
      logger.error({ projectId }, 'Project not found in database');
      return null;
    }

    if (!project.organization_id) {
      logger.error({ project }, 'Organization ID is missing from project');
      return null;
    }

    const redisKey = createProjectRedisKey(project.organization_id);

    logger.info(
      { redisKey, projectPublicId: project.public_id },
      'Attempting to get from Redis'
    );
    return await redis.hget(redisKey, project.public_id);
  } catch (error) {
    logger.error({ err: error }, 'Error retrieving project instruction');
    return null;
  }
}
