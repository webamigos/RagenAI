'use server';

import db from '@ragenai/prisma-client';
import type { UserDocument } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const getDocumentByIdQuery = async (documentId: UserDocument['id']) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.findFirst({
    where: {
      organizationId: orgId,
      id: documentId,
    },
  });
};

export const getDocumentByPublicIdQuery = async (
  documentId: UserDocument['id'],
) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.findFirst({
    where: {
      organizationId: orgId,
      id: documentId,
    },
    include: {
      file: true,
    },
  });
};
