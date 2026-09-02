'use server';

import db from '@ragenai/prisma-client';
import type { UserDocument } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';
import { getDocumentActor, canAccessDocument } from './get-document-actor';
import { decryptDocumentContent } from '@/libs/crypto/decrypt-documents';

export const getDocumentByIdQuery = async (documentId: UserDocument['id']) => {
  const orgId = await getOrgIdOrThrow();
  const doc = await db.userDocument.findFirst({
    where: {
      organizationId: orgId,
      id: documentId,
    },
  });

  if (!doc) {
    return null;
  }

  // Null rather than a distinct error: "you may not see this" and "this does
  // not exist" must be indistinguishable to the caller.
  const actor = await getDocumentActor(orgId);
  if (!(await canAccessDocument(documentId, orgId, actor))) {
    return null;
  }

  const { encryptedDek, ...rest } = doc;
  return {
    ...rest,
    content: await decryptDocumentContent(doc.content, encryptedDek),
  };
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

  if (!doc) {
    return null;
  }

  const actor = await getDocumentActor(orgId);
  if (!(await canAccessDocument(documentId, orgId, actor))) {
    return null;
  }

  const { encryptedDek, ...rest } = doc;
  return {
    ...rest,
    content: await decryptDocumentContent(doc.content, encryptedDek),
  };
};
