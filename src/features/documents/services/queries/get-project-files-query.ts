'use server';

import db from '@ragenai/prisma-client';
import type { Project } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
import { getProjectByPublicIdOrThrowQuery as getProjectByPublicIdOrThrow } from '@/features/projects/services/queries/get-project-query';

export const getProjectFilesQuery = async (
  projectPublicId: Project['public_id']
) => {
  const orgId = await getOrgIdOrThrow();
  const project = await getProjectByPublicIdOrThrow(projectPublicId);

  return await db.userFile.findMany({
    where: {
      organization_id: orgId,
      project_id: project.id,
    },
    select: {
      created_at: true,
      file_name: true,
      file_size: true,
      file_type: true,
      updated_at: true,
      metadata: true,
      organization_id: true,
      public_id: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};
