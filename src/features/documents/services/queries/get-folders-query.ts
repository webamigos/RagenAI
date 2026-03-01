'use server';

import db from '@ragenai/prisma-client';
import type { DocumentFolderItem } from '../../contracts/document.types';

export async function getFoldersQuery(
  organizationId: string,
  userTeamIds: string[],
): Promise<DocumentFolderItem[]> {
  const folders = await db.documentFolder.findMany({
    where: {
      organizationId,
      OR: [
        { teamId: null },
        ...(userTeamIds.length > 0 ? [{ teamId: { in: userTeamIds } }] : []),
      ],
    },
    include: {
      team: { select: { name: true } },
      _count: { select: { files: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    teamId: folder.teamId,
    teamName: folder.team?.name ?? null,
    fileCount: folder._count.files,
  }));
}
