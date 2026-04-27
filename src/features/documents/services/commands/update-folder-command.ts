'use server';

import db from '@ragenai/prisma-client';
import { type PiiPolicy } from '@/generated/prisma/client';

export async function updateFolderCommand(
  folderId: string,
  organizationId: string,
  data: { name?: string; teamId?: string | null; piiPolicy?: PiiPolicy },
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
      ...(data.piiPolicy !== undefined ? { piiPolicy: data.piiPolicy } : {}),
    },
  });
}
