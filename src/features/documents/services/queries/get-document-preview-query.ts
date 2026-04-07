'use server';

import db from '@ragenai/prisma-client';

export const getDocumentPreviewQuery = async ({
  orgId,
  documentId,
}: {
  orgId: string;
  documentId: string;
}) => {
  return await db.userDocument.findMany({
    where: {
      organizationId: orgId,
      id: documentId,
    },
    select: {
      content: true,
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
};
