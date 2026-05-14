'use server';

import db from '@ragenai/prisma-client';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import type {
  EffectiveProjectPermission,
  ProjectPermissionLevel,
} from '../../contracts/project-permission.types';

export async function getEffectiveProjectPermissionQuery(
  projectId: string,
  organizationId: string,
  userId: string,
): Promise<EffectiveProjectPermission> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, ownerId: true },
  });
  if (!project) {
    return {
      canView: false,
      canManage: false,
      canShare: false,
      canDelete: false,
      source: 'none',
    };
  }

  if (project.ownerId === userId) {
    return {
      canView: true,
      canManage: true,
      canShare: true,
      canDelete: true,
      source: 'owner',
    };
  }

  const member = await getActiveMember(organizationId).catch(() => null);
  if (member && isOrgAdmin(member.role)) {
    return {
      canView: true,
      canManage: true,
      canShare: true,
      canDelete: true,
      source: 'orgAdmin',
    };
  }

  // Legacy projects without an owner are visible to all org members
  if (project.ownerId === null) {
    return {
      canView: true,
      canManage: false,
      canShare: false,
      canDelete: false,
      source: 'none',
    };
  }

  const teamIds = (
    await db.teamMember.findMany({
      where: { userId, team: { organizationId } },
      select: { teamId: true },
    })
  ).map((t) => t.teamId);

  const grants = await db.projectPermission.findMany({
    where: {
      projectId,
      OR: [
        { granteeType: 'user', granteeId: userId },
        ...(teamIds.length > 0
          ? [{ granteeType: 'team', granteeId: { in: teamIds } }]
          : []),
      ],
    },
    select: { permission: true, granteeType: true },
  });

  if (grants.length === 0) {
    return {
      canView: false,
      canManage: false,
      canShare: false,
      canDelete: false,
      source: 'none',
    };
  }

  const hasFull = grants.some(
    (g) => (g.permission as ProjectPermissionLevel) === 'full',
  );
  const directShare = grants.some((g) => g.granteeType === 'user');

  return {
    canView: true,
    canManage: hasFull,
    canShare: false,
    canDelete: false,
    source: directShare ? 'directShare' : 'teamShare',
  };
}
