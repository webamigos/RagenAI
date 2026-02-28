'use server';

import db from '@ragenai/prisma-client';

export async function createFolderCommand(input: {
  name: string;
  organizationId: string;
  teamId?: string | null;
}) {
  const trimmedName = input.name.trim();
  if (!trimmedName || trimmedName.length > 255) {
    throw new Error('Invalid folder name');
  }

  if (input.teamId) {
    const team = await db.team.findFirst({
      where: { id: input.teamId, organizationId: input.organizationId },
    });
    if (!team) {
      throw new Error('Team not found in this organization');
    }
  }

  return db.documentFolder.create({
    data: {
      name: trimmedName,
      organizationId: input.organizationId,
      teamId: input.teamId ?? null,
    },
  });
}
