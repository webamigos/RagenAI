'use server';

import db from '@ragenai/prisma-client';
import { decryptDocumentContent } from '@/libs/crypto/decrypt-documents';

export const getDocumentPreviewQuery = async ({
  orgId,
  documentId,
}: {
  orgId: string;
  documentId: string;
}) => {
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
