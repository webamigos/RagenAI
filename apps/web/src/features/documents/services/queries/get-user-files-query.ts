'use server';

import db from '@ragenai/prisma-client';
import { fileAccessWhere } from './document-access';
import { type FileType, type EmbeddingStatus } from '@/generated/prisma/client';
import type {
  PaginatedUserFilesResult,
  UserFilesSort,
  UserFilesSortDir,
} from '@/features/documents/contracts/document.types';

export type FileViewMode = 'all' | 'my-files' | 'shared-with-me';

const DEFAULT_PAGE_SIZE = 25;

export const getUserFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
  options?: {
    userId?: string;
    isOrgAdmin?: boolean;
    folderId?: string | null;
    viewMode?: FileViewMode;
    sort?: UserFilesSort;
    dir?: UserFilesSortDir;
    page?: number;
    pageSize?: number;
    fileType?: FileType[];
    embeddingStatus?: EmbeddingStatus[];
  },
): Promise<PaginatedUserFilesResult> => {
  const {
    userId,
    isOrgAdmin,
    folderId,
    viewMode = 'all',
    sort = 'createdAt',
    dir = 'desc',
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    fileType = [],
    embeddingStatus = [],
  } = options ?? {};

  const baseWhere: Record<string, unknown> = { organizationId };

  if (folderId !== undefined) {
    baseWhere.folderId = folderId;
  }

  if (fileType.length > 0) {
    baseWhere.fileType = { in: fileType };
  }

  if (embeddingStatus.length > 0) {
    baseWhere.embeddingStatus = { in: embeddingStatus };
  }

  if (viewMode === 'my-files') {
    baseWhere.ownerId = userId;
  } else if (viewMode === 'shared-with-me') {
    baseWhere.ownerId = { not: null, notIn: userId ? [userId] : [] };

    const permissionConditions = [
      {
        permissions: {
          some: { granteeType: 'user', granteeId: userId },
        },
      },
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
      {
        folder: {
          permissions: {
            some: { granteeType: 'user', granteeId: userId },
          },
        },
      },
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
    // Composed, not restated. This branch used to spell the predicate out and
    // omitted folder-level grants, so sharing a folder showed the file under
    // "Shared with me" and nowhere the user actually browses.
    Object.assign(
      baseWhere,
      fileAccessWhere({
        userId: userId ?? null,
        teamIds: userTeamIds,
        isOrgAdmin: false,
      }),
    );
  }

  const skip = (page - 1) * pageSize;

  const [totalCount, items] = await Promise.all([
    db.userFile.count({ where: baseWhere }),
    db.userFile.findMany({
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
        piiPolicy: true,
        document: { select: { id: true } },
        project: { select: { title: true, id: true } },
        folder: { select: { id: true, name: true, teamId: true } },
        owner: { select: { name: true } },
      },
      orderBy: { [sort]: dir },
      skip,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return { items, totalCount, totalPages, page, pageSize };
};
