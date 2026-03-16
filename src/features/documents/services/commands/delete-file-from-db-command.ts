'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const deleteFileFromDbCommand = async (filePublicId: string) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userFile.deleteMany({
    where: {
      publicId: filePublicId,
      organizationId: orgId,
    },
  });
};
