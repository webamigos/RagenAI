'use server';

import db from '@ragenai/prisma-client';
import type { TeamDetails } from '../../contracts/team.types';

export async function getTeamDetailsQuery(
  teamId: string,
  organizationId: string,
): Promise<TeamDetails | null> {
  const team = await db.team.findFirst({
    where: { id: teamId, organizationId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!team) {
    return null;
  }

  return {
    id: team.id,
    name: team.name,
    organizationId: team.organizationId,
    members: team.members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      userName: m.user.name,
      userEmail: m.user.email,
      userImage: m.user.image,
      joinedAt: m.createdAt,
    })),
    createdAt: team.createdAt,
  };
}
