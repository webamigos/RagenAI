import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '../utils/auth-helpers';
import { logger } from '../utils/logger';
import { NotFoundException } from '@/app/api/v1/__logic__/services/api-errors.service';

async function getProjectInfo(projectId: string) {
  if (!projectId) {
    throw new NotFoundException('Project ID is required');
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  const project = await db.project.findUnique({
    where: { public_id: projectId },
    select: {
      id: true,
      public_id: true,
      organization_id: true,
    },
  });

  if (!project) {
    throw new NotFoundException('Project not found');
  }

  if (project.organization_id !== orgId) {
    logger.error(
      { projectId, userOrgId: orgId, projectOrgId: project.organization_id },
      'Unauthorized: Project does not belong to user organization'
    );
    throw new NotFoundException('Project not found');
  }

  return project;
}

export async function saveProjectInstruction(
  projectId: string,
  instruction: string
): Promise<void> {
  const project = await getProjectInfo(projectId);

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

  const settings = await db.projectSettings.findUnique({
    where: { project_id: project.id },
    select: { instructions: true },
  });

  return settings?.instructions ?? null;
}
