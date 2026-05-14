'use server';

import db from '@ragenai/prisma-client';
import type {
  ProjectGranteeType,
  ProjectPermissionItem,
  ProjectPermissionLevel,
} from '../../contracts/project-permission.types';

export async function getProjectPermissionsQuery(
  projectId: string,
  organizationId: string,
): Promise<ProjectPermissionItem[]> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) {
    return [];
  }

  const permissions = await db.projectPermission.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });
  if (permissions.length === 0) {
    return [];
  }

  const userIds = permissions
    .filter((p) => p.granteeType === 'user')
    .map((p) => p.granteeId);
  const teamIds = permissions
    .filter((p) => p.granteeType === 'team')
    .map((p) => p.granteeId);

  const [users, teams] = await Promise.all([
    userIds.length > 0
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
    teamIds.length > 0
      ? db.team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return permissions.map((p) => {
    const isUser = p.granteeType === 'user';
    const user = isUser ? userMap.get(p.granteeId) : undefined;
    const team = !isUser ? teamMap.get(p.granteeId) : undefined;
    return {
      id: String(p.id),
      granteeType: p.granteeType as ProjectGranteeType,
      granteeId: p.granteeId,
      granteeName: user?.name ?? team?.name ?? 'Unknown',
      granteeEmail: user?.email,
      permission: p.permission as ProjectPermissionLevel,
    };
  });
}
