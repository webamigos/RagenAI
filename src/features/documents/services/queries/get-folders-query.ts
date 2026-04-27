'use server';

import db from '@ragenai/prisma-client';
import type { DocumentFolderItem } from '../../contracts/document.types';

export async function getFoldersQuery(
  organizationId: string,
  userTeamIds: string[],
  userId?: string,
  isOrgAdmin?: boolean,
): Promise<DocumentFolderItem[]> {
  const whereClause = isOrgAdmin
    ? { organizationId }
    : {
        organizationId,
        OR: [
          { teamId: null, ownerId: null },
          { ownerId: userId },
          ...(userTeamIds.length > 0 ? [{ teamId: { in: userTeamIds } }] : []),
        ],
      };

  const folders = await db.documentFolder.findMany({
    where: whereClause,
    include: {
      team: { select: { name: true } },
      owner: { select: { name: true } },
      _count: { select: { files: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    teamId: folder.teamId,
    teamName: folder.team?.name ?? null,
    parentId: folder.parentId,
    path: folder.path,
    ownerId: folder.ownerId,
    ownerName: folder.owner?.name ?? null,
    fileCount: folder._count.files,
    piiPolicy: folder.piiPolicy,
  }));
}
