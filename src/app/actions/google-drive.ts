'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getDriveConnectorQuery } from '@/features/connectors/services/queries/get-drive-connector-query';
import { searchDriveFilesQuery } from '@/features/connectors/services/queries/search-drive-files-query';
import { getDriveFileContentQuery } from '@/features/connectors/services/queries/get-drive-file-content-query';

export type { DriveSearchResponse } from '@/features/connectors/services/queries/search-drive-files-query';
export type { DriveContentResponse } from '@/features/connectors/services/queries/get-drive-file-content-query';

export async function isDriveConnected(): Promise<boolean> {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
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

export async function searchDriveFiles(query: string = '', pageToken?: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return searchDriveFilesQuery(orgId, userId, query, pageToken);
}

export async function getDriveFileContent(fileId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Unauthorized' };
  }
  return getDriveFileContentQuery(orgId, userId, fileId);
}
