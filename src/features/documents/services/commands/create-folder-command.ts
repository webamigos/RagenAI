'use server';

import db from '@ragenai/prisma-client';
import { PiiPolicy } from '@/generated/prisma/client';

export async function createFolderCommand(input: {
  name: string;
  organizationId: string;
  teamId?: string | null;
  parentId?: string | null;
  ownerId?: string | null;
  piiPolicy?: PiiPolicy | null;
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

  let path = '/';
  if (input.parentId) {
    const parent = await db.documentFolder.findFirst({
      where: { id: input.parentId, organizationId: input.organizationId },
    });
    if (!parent) {
      throw new Error('Parent folder not found');
    }
    path = `${parent.path}${parent.id}/`;
  }

  return db.documentFolder.create({
    data: {
      name: trimmedName,
      organizationId: input.organizationId,
      teamId: input.teamId ?? null,
      parentId: input.parentId ?? null,
      path,
      ownerId: input.ownerId ?? null,
      piiPolicy: input.piiPolicy ?? PiiPolicy.TOXIC_ONLY,
    },
  });
}
