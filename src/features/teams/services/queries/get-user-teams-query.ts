'use server';

import db from '@ragenai/prisma-client';

export async function getUserTeamsQuery(
  organizationId: string,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const memberships = await db.teamMember.findMany({
    where: {
      userId,
      team: { organizationId },
    },
    select: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return memberships.map((m) => m.team);
}
