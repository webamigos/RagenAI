'use server';

import db from '@ragenai/prisma-client';
import type { OrgVisibilityScope } from '@ragenai/platform-contracts';

import { buildUserFilesWhere } from './user-files-where';
import {
  type FileType,
  type EmbeddingStatus,
  type PiiPolicy,
} from '@/generated/prisma/client';
import type {
  PaginatedUserFilesResult,
  UserFilesSort,
  UserFilesSortDir,
} from '@/features/documents/contracts/document.types';

export type { FileViewMode } from './user-files-where';
import type { FileViewMode } from './user-files-where';

const DEFAULT_PAGE_SIZE = 25;

export const getUserFilesQuery = async (
  organizationId: string,
  userTeamIds: string[] = [],
  options?: {
    userId?: string;
    scope?: OrgVisibilityScope;
    folderId?: string | null;
    viewMode?: FileViewMode;
    sort?: UserFilesSort;
    dir?: UserFilesSortDir;
    page?: number;
    pageSize?: number;
    fileType?: FileType[];
    embeddingStatus?: EmbeddingStatus[];
    piiPolicy?: PiiPolicy[];
  },
): Promise<PaginatedUserFilesResult> => {
  const {
    userId,
    scope = 'member',
    folderId,
    viewMode = 'all',
    sort = 'createdAt',
    dir = 'desc',
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    fileType = [],
    embeddingStatus = [],
    piiPolicy = [],
  } = options ?? {};

  const baseWhere = buildUserFilesWhere({
    organizationId,
    userId,
    scope,
    teamIds: userTeamIds,
    folderId,
    viewMode,
    fileType,
    embeddingStatus,
    piiPolicy,
  });

  // `null` is "nothing is visible in this view" — see `buildUserFilesWhere`.
  if (baseWhere === null) {
    return { items: [], totalCount: 0, totalPages: 1, page, pageSize };
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
