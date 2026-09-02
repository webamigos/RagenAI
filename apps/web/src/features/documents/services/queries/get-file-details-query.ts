'use server';

import db from '@ragenai/prisma-client';
import type { UserFile } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
import { fileAccessWhere } from './document-access';
import { getDocumentActor } from './get-document-actor';

/**
 * Returns null both when the file does not exist and when the caller may not
 * see it. Separating the two would tell an unauthorized caller that the id is
 * real, which is itself a disclosure.
 */
export const getFileDetailsByIdQuery = async (fileId: UserFile['id']) => {
  const orgId = await getOrgIdOrThrow();
  const actor = await getDocumentActor(orgId);
  return await db.userFile.findFirst({
    where: {
      organizationId: orgId,
      id: fileId,
      ...fileAccessWhere(actor),
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
