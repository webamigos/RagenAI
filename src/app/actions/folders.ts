'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import {
  requireOrgAdmin,
  getUserTeamIds,
  getActiveMember,
} from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { getFoldersQuery } from '@/features/documents/services/queries/get-folders-query';
import { getFolderBreadcrumbsQuery } from '@/features/documents/services/queries/get-folder-breadcrumbs-query';
import { createFolderCommand } from '@/features/documents/services/commands/create-folder-command';
import { updateFolderCommand } from '@/features/documents/services/commands/update-folder-command';
import { deleteFolderCommand } from '@/features/documents/services/commands/delete-folder-command';
import { moveFileToFolderCommand } from '@/features/documents/services/commands/move-file-to-folder-command';
import { moveFolderCommand } from '@/features/documents/services/commands/move-folder-command';

export async function getFolders() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  const [teamIds, member] = await Promise.all([
    getUserTeamIds(orgId, userId),
    getActiveMember(orgId).catch(() => null),
  ]);
  return getFoldersQuery(
    orgId,
    teamIds,
    userId,
    member ? isOrgAdmin(member.role) : false,
  );
}

export async function getFolderBreadcrumbs(folderId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getFolderBreadcrumbsQuery(folderId, orgId);
}

export async function createFolder(
  name: string,
  teamId?: string | null,
  parentId?: string | null,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  // Org admins create org-level folders; regular users always create personal folders
  const member = await getActiveMember(orgId).catch(() => null);
  const admin = member ? isOrgAdmin(member.role) : false;
  return createFolderCommand({
    name,
    organizationId: orgId,
    teamId: admin ? teamId : null,
    parentId,
    ownerId: admin ? null : (userId ?? null),
  });
}

export async function updateFolder(
  folderId: string,
  data: { name?: string; teamId?: string | null },
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return updateFolderCommand(folderId, orgId, data);
}

export async function deleteFolder(folderId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return deleteFolderCommand(folderId, orgId);
}

export async function moveFileToFolder(
  fileId: string,
  folderId: string | null,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return moveFileToFolderCommand(fileId, folderId, orgId);
}

export async function moveFolder(folderId: string, newParentId: string | null) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return moveFolderCommand(folderId, newParentId, orgId);
}
