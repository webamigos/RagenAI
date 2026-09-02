'use server';

import db from '@ragenai/prisma-client';
import { fileAccessWhere } from './document-access';

export const getAllOrgFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
  options?: {
    userId?: string;
    isOrgAdmin?: boolean;
  },
) => {
  const { userId, isOrgAdmin } = options ?? {};

  // Composed, not restated: `fileAccessWhere` is the one definition of what
  // this actor may reach, shared with the by-id routes. See document-access.ts.
  const accessFilter = fileAccessWhere({
    userId: userId ?? null,
    teamIds: userTeamIds,
    isOrgAdmin: Boolean(isOrgAdmin),
  });

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
