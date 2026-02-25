'use server';

import db from '@ragenai/prisma-client';
import type { UserFile } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const getFileDetailsByPublicIdQuery = async (
  publicFileId: UserFile['public_id']
) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userFile.findFirst({
    where: {
      organization_id: orgId,
      public_id: publicFileId,
    },
  });
};

export const getOrganizationFilesCountQuery = async (
  organizationId: string
): Promise<number> => {
  const count = await db.userFile.count({
    where: {
      organization_id: organizationId,
    },
  });
  return count;
};
