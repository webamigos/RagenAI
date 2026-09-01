'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import { getEffectiveProjectPermissionQuery } from '@/features/projects/services/queries/get-effective-project-permission-query';
import type { ProjectPermissionItem } from '@/features/projects/contracts/project-permission.types';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type {
  ProjectGranteeType,
  ProjectPermissionLevel,
} from '@/features/projects/contracts/project-permission.types';

/**
 * `shareProject`/`revokeProjectShare` below keep their existing
 * `canShare` authority check running locally (via
 * `getEffectiveProjectPermissionQuery`) rather than moving it to
 * apps/api — `ProjectsService.shareProject()`/`.revokeProjectShare()`
 * were ported faithfully from `shareProjectCommand`/
 * `revokeProjectShareCommand`, and neither original command did this
 * check itself either; it only ever lived in this action layer. Only
 * the terminal write is cut over to apps/api, per
 * docs/adrs/21-monorepo-and-api-decoupling.md's Phase C UI cutover.
 */
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

  return ragenApiRequest<{ success: boolean; error?: string }>({
    method: 'POST',
    path: `/v1/internal/projects/${encodeURIComponent(projectId)}/share`,
    userId: auth.userId,
    orgId: auth.orgId,
    body: { granteeType, granteeId, permission },
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

  return ragenApiRequest<{ success: boolean; error?: string }>({
    method: 'DELETE',
    path: `/v1/internal/projects/permissions/${encodeURIComponent(String(permissionId))}`,
    userId,
    orgId,
  });
}

export async function getProjectPermissions(projectId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  return ragenApiRequest<ProjectPermissionItem[]>({
    method: 'GET',
    path: `/v1/internal/projects/${encodeURIComponent(projectId)}/permissions`,
    userId,
    orgId,
  });
}

export async function getEffectiveProjectPermission(projectId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }
  return getEffectiveProjectPermissionQuery(projectId, orgId, userId);
}
