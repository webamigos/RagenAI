'use server';

import db from '@ragenai/prisma-client';

export const getUserFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
) => {
  return await db.userFile.findMany({
    where: {
      organization_id: organizationId,
      OR: [
        { folder_id: null },
        { folder: { teamId: null } },
        ...(userTeamIds.length > 0
          ? [{ folder: { teamId: { in: userTeamIds } } }]
          : []),
      ],
    },
    select: {
      created_at: true,
      file_name: true,
      file_size: true,
      file_type: true,
      updated_at: true,
      metadata: true,
      organization_id: true,
      public_id: true,
      project_id: true,
      folder_id: true,
      embedding_status: true,
      embedding_completed_at: true,
      embedding_failed_at: true,
      embedding_started_at: true,
      document: {
        select: {
          public_id: true,
        },
      },
      project: {
        select: {
          title: true,
          id: true,
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
