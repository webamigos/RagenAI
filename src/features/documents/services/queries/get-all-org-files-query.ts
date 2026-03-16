'use server';

import db from '@ragenai/prisma-client';

export const getAllOrgFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
) => {
  return await db.userFile.findMany({
    where: {
      organizationId: organizationId,
      embeddingStatus: 'COMPLETED',
      OR: [
        { folderId: null },
        { folder: { teamId: null } },
        ...(userTeamIds.length > 0
          ? [{ folder: { teamId: { in: userTeamIds } } }]
          : []),
      ],
    },
    select: {
      publicId: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      createdAt: true,
      folderId: true,
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
      createdAt: 'desc',
    },
  });
};
