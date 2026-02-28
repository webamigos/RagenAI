'use server';

import db from '@ragenai/prisma-client';
import type { TeamListItem } from '../../contracts/team.types';

export async function getTeamsQuery(
  organizationId: string,
): Promise<TeamListItem[]> {
  const teams = await db.team.findMany({
    where: { organizationId },
    include: {
      _count: {
        select: { members: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: team._count.members,
    createdAt: team.createdAt,
  }));
}
