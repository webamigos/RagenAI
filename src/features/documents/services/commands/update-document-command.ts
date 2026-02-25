'use server';

import db from '@ragenai/prisma-client';
import type { UserDocument } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const updateDocumentTitleCommand = async ({
  orgId,
  documentId,
  title,
}: {
  orgId: string;
  documentId: string;
  title?: string;
}) => {
  await db.userDocument.updateMany({
    where: {
      organization_id: orgId,
      public_id: documentId,
    },
    data: {
      title,
      updated_at: new Date(),
    },
  });
};

export const updateDocumentContentCommand = async ({
  orgId,
  documentId,
  content,
}: {
  orgId: string;
  documentId: string;
  content?: string;
}) => {
  await db.userDocument.updateMany({
    where: {
      organization_id: orgId,
      public_id: documentId,
    },
    data: {
      content,
      updated_at: new Date(),
    },
  });
};

export const deleteDocumentFromDbCommand = async (
  documentId: UserDocument['id']
) => {
  const orgId = await getOrgIdOrThrow();
  return await db.userDocument.deleteMany({
    where: {
      id: documentId,
      organization_id: orgId,
    },
  });
};
