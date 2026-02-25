import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '../utils/auth-helpers';
import { logger } from '../utils/logger';

async function getProjectInfo(projectId: string) {
  if (!projectId) {
    logger.error('Project ID is empty or undefined');
    return null;
  }

  const orgId = await getOrgIdFromAuthOrThrow();
  if (!orgId) {
    logger.error('User not authenticated or missing organization ID');
    return null;
  }

  const project = await db.project.findUnique({
    where: { public_id: projectId },
    select: {
      id: true,
      public_id: true,
      organization_id: true,
    },
  });

  if (!project) return null;

  if (project.organization_id !== orgId) {
    logger.error(
      { projectId, userOrgId: orgId, projectOrgId: project.organization_id },
      'Unauthorized: Project does not belong to user organization'
    );
    return null;
  }

  return project;
}

export async function saveProjectInstruction(
  projectId: string,
  instruction: string
): Promise<void> {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const project = await getProjectInfo(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  await db.projectSettings.upsert({
    where: { project_id: project.id },
    update: { instructions: instruction },
    create: { project_id: project.id, instructions: instruction },
  });
}

export async function getProjectInstruction(
  projectId: string
): Promise<string | null> {
  if (!projectId) {
    return null;
  }

  const project = await getProjectInfo(projectId);
  if (!project) {
    return null;
  }

  const settings = await db.projectSettings.findUnique({
    where: { project_id: project.id },
    select: { instructions: true },
  });

  return settings?.instructions ?? null;
}
