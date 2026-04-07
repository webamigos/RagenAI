'use server';

import db from '@ragenai/prisma-client';
import type { Project, UserFile } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const deleteProjectFileFromDbCommand = async (
  fileId: UserFile['id'],
  projectId: Project['id'],
) => {
  const orgId = await getOrgIdOrThrow();

  return await db.userFile.deleteMany({
    where: {
      id: fileId,
      organizationId: orgId,
      projectId: projectId,
    },
  });
};
