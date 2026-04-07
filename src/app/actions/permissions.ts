'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import db from '@ragenai/prisma-client';
import { shareResourceCommand } from '@/features/documents/services/commands/share-resource-command';
import { revokeShareCommand } from '@/features/documents/services/commands/revoke-share-command';
import {
  getFilePermissionsQuery,
  getFolderPermissionsQuery,
} from '@/features/documents/services/queries/get-resource-permissions-query';
import type {
  GranteeType,
  PermissionLevel,
} from '@/features/documents/contracts/permission.types';

/** Verify caller is the resource owner or an org admin */
async function requireOwnerOrAdmin(
  orgId: string,
  userId: string,
  resourceType: 'file' | 'folder',
  resourceId: string,
): Promise<{ authorized: boolean; error?: string }> {
  const member = await getActiveMember(orgId).catch(() => null);
  if (member && isOrgAdmin(member.role)) {
    return { authorized: true };
  }

  if (resourceType === 'file') {
    const file = await db.userFile.findFirst({
      where: { id: resourceId, organizationId: orgId },
      select: { ownerId: true },
    });
    if (!file) {
      return { authorized: false, error: 'File not found' };
    }
    if (file.ownerId !== userId) {
      return {
        authorized: false,
        error: 'Only the file owner or an admin can manage sharing',
      };
    }
  } else {
    const folder = await db.documentFolder.findFirst({
      where: { id: resourceId, organizationId: orgId },
      select: { ownerId: true },
    });
    if (!folder) {
      return { authorized: false, error: 'Folder not found' };
    }
    if (folder.ownerId !== userId) {
      return {
        authorized: false,
        error: 'Only the folder owner or an admin can manage sharing',
      };
    }
  }

  return { authorized: true };
}

export async function shareFile(
  fileId: string,
  granteeType: GranteeType,
  granteeId: string,
  permission: PermissionLevel,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  const auth = await requireOwnerOrAdmin(orgId, userId, 'file', fileId);
  if (!auth.authorized) {
    return { success: false, error: auth.error! };
  }

  return shareResourceCommand({
    resourceType: 'file',
    fileId,
    organizationId: orgId,
    granteeType,
    granteeId,
    permission,
    grantedBy: userId,
  });
}

export async function shareFolder(
  folderId: string,
  granteeType: GranteeType,
  granteeId: string,
  permission: PermissionLevel,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  const auth = await requireOwnerOrAdmin(orgId, userId, 'folder', folderId);
  if (!auth.authorized) {
    return { success: false, error: auth.error! };
  }

  return shareResourceCommand({
    resourceType: 'folder',
    folderId,
    organizationId: orgId,
    granteeType,
    granteeId,
    permission,
    grantedBy: userId,
  });
}

export async function revokeShare(permissionId: number) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check the permission to find the resource, then verify ownership
  const perm = await db.documentPermission.findUnique({
    where: { id: permissionId },
    select: { resourceType: true, fileId: true, folderId: true },
  });
  if (!perm) {
    return { success: false, error: 'Permission not found' };
  }

  const resourceType = perm.resourceType as 'file' | 'folder';
  const resourceId = resourceType === 'file' ? perm.fileId! : perm.folderId!;
  const auth = await requireOwnerOrAdmin(
    orgId,
    userId,
    resourceType,
    resourceId,
  );
  if (!auth.authorized) {
    return { success: false, error: auth.error! };
  }

  return revokeShareCommand(permissionId, orgId);
}

export async function getFilePermissions(fileId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getFilePermissionsQuery(fileId, orgId);
}

export async function getFolderPermissions(folderId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getFolderPermissionsQuery(folderId, orgId);
}
