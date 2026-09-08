'use server';

import db from '@ragenai/prisma-client';
import { decryptDocumentContent } from '@ragenai/crypto';
import { getDocumentActor, canAccessDocument } from './get-document-actor';

export const getDocumentPreviewQuery = async ({
  orgId,
  documentId,
}: {
  orgId: string;
  documentId: string;
}) => {
  // This one decrypts and returns document *content*, so it is the highest
  // value of the by-id paths to get wrong. Empty array when the caller may not
  // see it — the same answer as "no such document".
  const actor = await getDocumentActor(orgId);
  if (!(await canAccessDocument(documentId, orgId, actor))) {
    return [];
  }

  const docs = await db.userDocument.findMany({
    where: {
      organizationId: orgId,
      id: documentId,
    },
    select: {
      content: true,
      encryptedDek: true,
      title: true,
      file: {
        select: {
          id: true,
          fileType: true,
          fileExtension: true,
        },
      },
    },
  });

  return Promise.all(
    docs.map(async ({ encryptedDek, ...rest }) => ({
      ...rest,
      content: await decryptDocumentContent(rest.content, encryptedDek),
    })),
  );
};
