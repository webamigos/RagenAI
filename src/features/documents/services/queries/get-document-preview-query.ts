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
      organization_id: orgId,
      public_id: documentPublicId,
    },
    select: {
      content: true,
      title: true,
      file: {
        select: {
          public_id: true,
          file_type: true,
          file_extension: true,
        },
      },
    },
  });
};
