'use server';

import db from '@ragenai/prisma-client';
import type { UserDocument } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
import { decryptDocumentContent } from '@/libs/crypto/decrypt-documents';

export const getDocumentByIdQuery = async (documentId: UserDocument['id']) => {
  const orgId = await getOrgIdOrThrow();
  const doc = await db.userDocument.findFirst({
    where: {
      organizationId: orgId,
      id: documentId,
    },
  });

  if (doc) {
    doc.content = await decryptDocumentContent(doc.content, doc.encryptedDek);
  }

  return doc;
};

export const getDocumentByIdWithFileQuery = async (
  documentId: UserDocument['id'],
) => {
  const orgId = await getOrgIdOrThrow();
  const doc = await db.userDocument.findFirst({
    where: {
      organizationId: orgId,
      id: documentId,
    },
    include: {
      file: true,
    },
  });

  if (doc) {
    doc.content = await decryptDocumentContent(doc.content, doc.encryptedDek);
  }

  return doc;
};
