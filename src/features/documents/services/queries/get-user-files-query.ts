'use server';

import db from '@ragenai/prisma-client';

export type FileViewMode = 'all' | 'my-files' | 'shared-with-me';

export const getUserFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
  options?: {
    userId?: string;
    isOrgAdmin?: boolean;
    folderId?: string | null;
    viewMode?: FileViewMode;
  },
) => {
  const { userId, isOrgAdmin, folderId, viewMode = 'all' } = options ?? {};

  // Build the WHERE clause based on view mode and permissions
  const baseWhere: Record<string, unknown> = {
    organizationId,
  };

  // Filter by folder if specified
  if (folderId !== undefined) {
    baseWhere.folderId = folderId;
  }

  if (viewMode === 'my-files') {
    baseWhere.ownerId = userId;
  } else if (viewMode === 'shared-with-me') {
    // Only files explicitly shared with this user via DocumentPermission
    // Excludes user's own files and org-wide (null owner) files
    baseWhere.ownerId = { not: null, notIn: userId ? [userId] : [] };

    // Must have an explicit permission for this user or their teams
    const permissionConditions = [
      // Direct user permission on file
      {
        permissions: {
          some: {
            granteeType: 'user',
            granteeId: userId,
          },
        },
      },
      // Team permission on file
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
      // Files in folders shared with user
      {
        folder: {
          permissions: {
            some: {
              granteeType: 'user',
              granteeId: userId,
            },
          },
        },
      },
      // Files in folders shared with user's teams
      ...(userTeamIds.length > 0
        ? [
            {
              folder: {
                permissions: {
                  some: {
                    granteeType: 'team',
                    granteeId: { in: userTeamIds },
                  },
                },
              },
            },
          ]
        : []),
    ];

    baseWhere.OR = permissionConditions;
  } else if (!isOrgAdmin) {
    // "all" view: show files the user can access (org admins see everything)
    baseWhere.OR = [
      // Legacy files: no owner, accessible to all org members
      { ownerId: null },
      // User's own files
      { ownerId: userId },
      // Files in team folders
      ...(userTeamIds.length > 0
        ? [{ folder: { teamId: { in: userTeamIds } } }]
        : []),
      // Files with direct user permission
      {
        permissions: {
          some: {
            resourceType: 'file',
            granteeType: 'user',
            granteeId: userId,
          },
        },
      },
      // Files with team permission
      ...(userTeamIds.length > 0
        ? [
            {
              permissions: {
                some: {
                  resourceType: 'file',
                  granteeType: 'team',
                  granteeId: { in: userTeamIds },
                },
              },
            },
          ]
        : []),
    ];
  }

  return await db.userFile.findMany({
    where: baseWhere,
    select: {
      createdAt: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      updatedAt: true,
      metadata: true,
      organizationId: true,
      id: true,
      projectId: true,
      folderId: true,
      ownerId: true,
      embeddingStatus: true,
      embeddingCompletedAt: true,
      embeddingFailedAt: true,
      embeddingStartedAt: true,
      parsingStatus: true,
      thumbnailS3Key: true,
      document: {
        select: {
          id: true,
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
