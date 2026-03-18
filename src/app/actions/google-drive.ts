'use server';

import {
  getOrgIdFromAuth,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getDriveConnectorQuery } from '@/features/connectors/services/queries/get-drive-connector-query';
import { searchDriveFilesQuery } from '@/features/connectors/services/queries/search-drive-files-query';
import { getDriveFileContentQuery } from '@/features/connectors/services/queries/get-drive-file-content-query';
import { searchDriveFoldersQuery } from '@/features/connectors/services/queries/search-drive-folders-query';
import { listDriveFolderFilesQuery } from '@/features/connectors/services/queries/list-drive-folder-files-query';
import { importDriveFolderCommand } from '@/features/connectors/services/commands/import-drive-folder-command';
import { getDriveSyncsQuery } from '@/features/connectors/services/queries/get-drive-syncs-query';
import { deleteDriveSyncCommand } from '@/features/connectors/services/commands/delete-drive-sync-command';

export type { DriveSearchResponse } from '@/features/connectors/services/queries/search-drive-files-query';
export type { DriveContentResponse } from '@/features/connectors/services/queries/get-drive-file-content-query';
export type { DriveFolderFilesResponse } from '@/features/connectors/services/queries/list-drive-folder-files-query';

export async function isDriveConnected(): Promise<boolean> {
  try {
    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return false;
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }
    const connector = await getDriveConnectorQuery(orgId, userId);
    return connector !== null;
  } catch {
    return false;
  }
}

export async function searchDriveFiles(
  query: string = '',
  pageToken?: string,
  includeFolders: boolean = false,
) {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  // Empty string = no mime_type filter (show all file types including folders)
  const mimeType = includeFolders ? '' : 'application/vnd.google-apps.document';
  return searchDriveFilesQuery(orgId, userId, query, pageToken, mimeType);
}

export async function getDriveFileContent(fileId: string) {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return getDriveFileContentQuery(orgId, userId, fileId);
}

export async function searchDriveFolders(
  query: string = '',
  pageToken?: string,
) {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return searchDriveFoldersQuery(orgId, userId, query, pageToken);
}

export async function listDriveFolderFiles(
  folderId: string,
  pageToken?: string,
) {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return listDriveFolderFilesQuery(orgId, userId, folderId, 50, pageToken);
}

export async function importDriveFolder(
  folderId: string,
  folderName: string,
  projectPublicId: string,
  enableSync: boolean = false,
) {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return importDriveFolderCommand(
    orgId,
    userId,
    folderId,
    folderName,
    projectPublicId,
    enableSync,
  );
}

export async function getDriveSyncs(projectPublicId?: string) {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return { success: false as const, error: 'Unauthorized', syncs: [] };
  }
  return getDriveSyncsQuery(orgId, projectPublicId);
}

export async function removeDriveSync(syncId: string) {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return deleteDriveSyncCommand(orgId, syncId);
}
