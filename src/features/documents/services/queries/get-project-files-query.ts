'use server';

import db from '@ragenai/prisma-client';
import type { Project } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
export const getProjectFilesQuery = async (projectId: Project['id']) => {
  const orgId = await getOrgIdOrThrow();

  return await db.userFile.findMany({
    where: {
      organizationId: orgId,
      projectId: projectId,
    },
    select: {
      id: true,
      createdAt: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      updatedAt: true,
      metadata: true,
      organizationId: true,
      parsingStatus: true,
      embeddingStatus: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};
