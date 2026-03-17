'use server';

import db from '@ragenai/prisma-client';
import type { Project } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
import { getProjectByPublicIdOrThrowQuery as getProjectByPublicIdOrThrow } from '@/features/projects/services/queries/get-project-query';

export const getProjectFilesQuery = async (
  projectPublicId: Project['publicId'],
) => {
  const orgId = await getOrgIdOrThrow();
  const project = await getProjectByPublicIdOrThrow(projectPublicId);

  return await db.userFile.findMany({
    where: {
      organizationId: orgId,
      projectId: project.id,
    },
    select: {
      createdAt: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      updatedAt: true,
      metadata: true,
      organizationId: true,
      publicId: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};
