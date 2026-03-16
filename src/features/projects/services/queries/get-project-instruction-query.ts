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
    where: { publicId: projectId },
    select: {
      id: true,
      publicId: true,
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

export async function getProjectInstructionQuery(
  projectId: string,
): Promise<string | null> {
  if (!projectId) {
    return null;
  }

  const project = await getProjectInfo(projectId);

  const settings = await db.projectSettings.findUnique({
    where: { projectId: project.id },
    select: { instructions: true },
  });

  return settings?.instructions ?? null;
}
