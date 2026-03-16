'use server';

import db from '@ragenai/prisma-client';

export const getUserFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
) => {
  return await db.userFile.findMany({
    where: {
      organizationId: organizationId,
      OR: [
        { folderId: null },
        { folder: { teamId: null } },
        ...(userTeamIds.length > 0
          ? [{ folder: { teamId: { in: userTeamIds } } }]
          : []),
      ],
    },
    select: {
      createdAt: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      updatedAt: true,
      metadata: true,
      organizationId: true,
      publicId: true,
      projectId: true,
      folderId: true,
      embeddingStatus: true,
      embeddingCompletedAt: true,
      embeddingFailedAt: true,
      embeddingStartedAt: true,
      parsingStatus: true,
      thumbnailS3Key: true,
      document: {
        select: {
          publicId: true,
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
      createdAt: 'desc',
    },
  });
};
