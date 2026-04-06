import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

async function getProjectInfo(projectId: string) {
  if (!projectId) {
    throw new NotFoundException('Project ID is required');
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      organizationId: true,
    },
  });

  if (!project) {
    throw new NotFoundException('Project not found');
  }

  if (project.organizationId !== orgId) {
    logger.error(
      { projectId, userOrgId: orgId, projectOrgId: project.organizationId },
      'Unauthorized: Project does not belong to user organization',
    );
    throw new NotFoundException('Project not found');
  }

  return project;
}

export async function saveProjectInstructionCommand(
  projectId: string,
  instruction: string,
): Promise<void> {
  const project = await getProjectInfo(projectId);

  await db.projectSettings.upsert({
    where: { projectId: project.id },
    update: { instructions: instruction },
    create: { projectId: project.id, instructions: instruction },
  });
}
