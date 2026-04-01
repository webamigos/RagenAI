'use server';

import db from '@ragenai/prisma-client';

export async function updateFolderCommand(
  folderId: number,
  organizationId: string,
  data: { name?: string; teamId?: string | null },
) {
  if (data.teamId !== undefined && data.teamId !== null) {
    if (!data.teamId) {
      throw new Error('Team ID cannot be an empty string');
    }
    const team = await db.team.findFirst({
      where: { id: data.teamId, organizationId },
    });
    if (!team) {
      throw new Error('Team not found in this organization');
    }
  }

  return db.documentFolder.update({
    where: { id: folderId, organizationId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
    },
  });
}
