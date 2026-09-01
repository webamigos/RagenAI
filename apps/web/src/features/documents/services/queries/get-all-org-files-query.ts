'use server';

import db from '@ragenai/prisma-client';

export const getAllOrgFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
  options?: {
    userId?: string;
    isOrgAdmin?: boolean;
  },
) => {
  const { userId, isOrgAdmin } = options ?? {};

  const accessFilter = isOrgAdmin
    ? {}
    : {
        OR: [
          // Legacy files: no owner, accessible to all
          { ownerId: null },
          // User's own files
          ...(userId ? [{ ownerId: userId }] : []),
          // Files in team folders
          ...(userTeamIds.length > 0
            ? [{ folder: { teamId: { in: userTeamIds } } }]
            : []),
          // Files with direct permission
          ...(userId
            ? [
                {
                  permissions: {
                    some: {
                      granteeType: 'user',
                      granteeId: userId,
                    },
                  },
                },
              ]
            : []),
          // Files with team permission
          ...(userTeamIds.length > 0
            ? [
                {
                  permissions: {
                    some: {
                      granteeType: 'team',
                      granteeId: { in: userTeamIds },
                    },
                  },
                },
              ]
            : []),
        ],
      };

  return await db.userFile.findMany({
    where: {
      organizationId,
      embeddingStatus: 'COMPLETED',
      ...accessFilter,
    },
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      createdAt: true,
      folderId: true,
      ownerId: true,
      piiPolicy: true,
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
      owner: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};
