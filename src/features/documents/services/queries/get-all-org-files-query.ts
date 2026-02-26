'use server';

import db from '@ragenai/prisma-client';

export const getAllOrgFilesQuery = async (organizationId: string) => {
  return await db.userFile.findMany({
    where: {
      organization_id: organizationId,
      embedding_status: 'COMPLETED',
    },
    select: {
      public_id: true,
      file_name: true,
      file_size: true,
      file_type: true,
      created_at: true,
      project: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};
