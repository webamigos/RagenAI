'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import { requireOrgAdmin, getUserTeamIds } from '@/lib/auth-guards';
import { getFoldersQuery } from '@/features/documents/services/queries/get-folders-query';
import { createFolderCommand } from '@/features/documents/services/commands/create-folder-command';
import { updateFolderCommand } from '@/features/documents/services/commands/update-folder-command';
import { deleteFolderCommand } from '@/features/documents/services/commands/delete-folder-command';
import { moveFileToFolderCommand } from '@/features/documents/services/commands/move-file-to-folder-command';

export async function getFolders() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  const teamIds = await getUserTeamIds(orgId, userId);
  return getFoldersQuery(orgId, teamIds);
}

export async function createFolder(name: string, teamId?: string | null) {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return createFolderCommand({ name, organizationId: orgId, teamId });
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
  filePublicId: string,
  folderId: string | null,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return moveFileToFolderCommand(filePublicId, folderId, orgId);
}
