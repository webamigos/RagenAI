'use server';

import db from '@ragenai/prisma-client';
import type { UserDocument } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const getDocumentByIdQuery = async (documentId: UserDocument['id']) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.findFirst({
    where: {
      organization_id: orgId,
      id: documentId,
    },
  });
};

export const getDocumentByPublicIdQuery = async (
  documentPublicId: UserDocument['public_id']
) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.findFirst({
    where: {
      organization_id: orgId,
      public_id: documentPublicId,
    },
    include: {
      file: true,
    },
  });
};
