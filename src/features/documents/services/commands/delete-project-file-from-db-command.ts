'use server';

import db from '@ragenai/prisma-client';
import type { Project, UserFile } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
import { getProjectByPublicIdQuery as getProjectByPublicId } from '@/features/projects/services/queries/get-project-query';

export const deleteProjectFileFromDbCommand = async (
  publicFileId: UserFile['publicId'],
  projectPublicId: Project['publicId'],
) => {
  const orgId = await getOrgIdOrThrow();
  const projectRecord = await getProjectByPublicId(projectPublicId);

  if (!projectRecord) {
    throw new Error('Project not found!');
  }

  return await db.userFile.deleteMany({
    where: {
      publicId: publicFileId,
      organizationId: orgId,
      projectId: projectRecord.id,
    },
  });
};
