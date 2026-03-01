'use server';

import db from '@ragenai/prisma-client';

export const getAllOrgFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
) => {
  return await db.userFile.findMany({
    where: {
      organization_id: organizationId,
      embedding_status: 'COMPLETED',
      OR: [
        { folder_id: null },
        { folder: { teamId: null } },
        ...(userTeamIds.length > 0
          ? [{ folder: { teamId: { in: userTeamIds } } }]
          : []),
      ],
    },
    select: {
      public_id: true,
      file_name: true,
      file_size: true,
      file_type: true,
      created_at: true,
      folder_id: true,
      project: {
        select: {
          id: true,
          title: true,
        },
      },
      folder: {
        select: {
          id: true,
          name: true,
          teamId: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};
