import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

export async function saveProjectMcpProvidersCommand(
  projectId: string,
  enabledMcpProviders: string[],
): Promise<void> {
  const orgId = await getOrgIdFromAuthOrThrow();

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });

  if (!project || project.organizationId !== orgId) {
    logger.error(
      { projectId, userOrgId: orgId, projectOrgId: project?.organizationId },
      'Unauthorized: Project does not belong to user organization',
    );
    throw new NotFoundException('Project not found');
  }

  await db.projectSettings.upsert({
    where: { projectId: project.id },
    update: { enabledMcpProviders },
    create: { projectId: project.id, enabledMcpProviders },
  });
}
