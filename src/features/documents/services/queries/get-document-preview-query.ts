'use server';

import db from '@ragenai/prisma-client';

export const getDocumentPreviewQuery = async ({
  orgId,
  documentPublicId,
}: {
  orgId: string;
  documentPublicId: string;
}) => {
  return await db.userDocument.findMany({
    where: {
      organizationId: orgId,
      publicId: documentPublicId,
    },
    select: {
      content: true,
      title: true,
      file: {
        select: {
          publicId: true,
          fileType: true,
          fileExtension: true,
        },
      },
    },
  });
};
