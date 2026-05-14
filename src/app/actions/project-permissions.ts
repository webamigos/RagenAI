'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import { shareProjectCommand } from '@/features/projects/services/commands/share-project-command';
import { revokeProjectShareCommand } from '@/features/projects/services/commands/revoke-project-share-command';
import { getProjectPermissionsQuery } from '@/features/projects/services/queries/get-project-permissions-query';
import { getEffectiveProjectPermissionQuery } from '@/features/projects/services/queries/get-effective-project-permission-query';
import type {
  ProjectGranteeType,
  ProjectPermissionLevel,
} from '@/features/projects/contracts/project-permission.types';

async function requireProjectShareAuthority(projectId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false as const, error: 'Not authenticated' };
  }
  const perm = await getEffectiveProjectPermissionQuery(
    projectId,
    orgId,
    userId,
  );
  if (!perm.canShare) {
    return {
      ok: false as const,
      error: 'Only the project owner or an admin can manage sharing',
    };
  }
  return { ok: true as const, orgId, userId };
}

export async function shareProject(
  projectId: string,
  granteeType: ProjectGranteeType,
  granteeId: string,
  permission: ProjectPermissionLevel,
) {
  const auth = await requireProjectShareAuthority(projectId);
  if (!auth.ok) {
    return { success: false as const, error: auth.error };
  }

  return shareProjectCommand({
    projectId,
    organizationId: auth.orgId,
    granteeType,
    granteeId,
    permission,
    grantedBy: auth.userId,
  });
}

export async function revokeProjectShare(permissionId: number) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Not authenticated' };
  }

  // Look up which project this permission belongs to, then verify share authority
  const { default: db } = await import('@ragenai/prisma-client');
  const record = await db.projectPermission.findUnique({
    where: { id: permissionId },
    select: { projectId: true, project: { select: { organizationId: true } } },
  });
  if (!record || record.project.organizationId !== orgId) {
    return { success: false as const, error: 'Permission not found' };
  }

  const perm = await getEffectiveProjectPermissionQuery(
    record.projectId,
    orgId,
    userId,
  );
  if (!perm.canShare) {
    return {
      success: false as const,
      error: 'Only the project owner or an admin can manage sharing',
    };
  }

  return revokeProjectShareCommand(permissionId, orgId);
}

export async function getProjectPermissions(projectId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getProjectPermissionsQuery(projectId, orgId);
}

export async function getEffectiveProjectPermission(projectId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }
  return getEffectiveProjectPermissionQuery(projectId, orgId, userId);
}
