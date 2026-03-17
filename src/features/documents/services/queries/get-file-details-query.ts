'use server';

import db from '@ragenai/prisma-client';
import type { UserFile } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const getFileDetailsByPublicIdQuery = async (
  publicFileId: UserFile['publicId'],
) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userFile.findFirst({
    where: {
      organizationId: orgId,
      publicId: publicFileId,
    },
  });
};

export const getOrganizationFilesCountQuery = async (
  organizationId: string,
): Promise<number> => {
  const count = await db.userFile.count({
    where: {
      organizationId: organizationId,
    },
  });
  return count;
};
