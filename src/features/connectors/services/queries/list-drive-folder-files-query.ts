import { logger } from '@/app/lib/utils/logger';
import { getDriveConnectorQuery } from './get-drive-connector-query';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';
import type { DriveFile } from './search-drive-files-query';

export type DriveFolderFilesResponse = {
  success: boolean;
  files?: DriveFile[];
  folderName?: string;
  count?: number;
  nextPageToken?: string;
  error?: string;
};

export const listDriveFolderFilesQuery = async (
  organizationId: string,
  userId: string,
  folderId: string,
  pageSize: number = 50,
  pageToken?: string,
): Promise<DriveFolderFilesResponse> => {
  const connector = await getDriveConnectorQuery(organizationId, userId);
  if (!connector) {
    return { success: false, error: 'Google Drive not connected' };
  }

  try {
    const params = new URLSearchParams({
      customer_id: connector.customerId,
      page_size: String(pageSize),
    });
    if (pageToken) {
      params.set('page_token', pageToken);
    }

    const response = await fetchWithTimeout(
      `${connector.baseUrl}/drive/folder/${encodeURIComponent(folderId)}/files?${params}`,
      { timeoutMs: 15_000 },
    );
    if (!response.ok) {
      logger.error(
        { status: response.status, folderId },
        'Google Drive folder files listing returned error status',
      );
      return { success: false, error: 'Failed to list folder files' };
    }
    const data = await response.json();
    if (!data.success) {
      logger.error(
        { error: data.error },
        'Google Drive folder files API error',
      );
      return {
        success: false,
        error: data.error || 'Failed to list folder files',
      };
    }
    return {
      success: true,
      files: data.files,
      folderName: data.folder_name,
      count: data.count,
      nextPageToken: data.next_page_token || undefined,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error listing Google Drive folder files');
    return { success: false, error: 'Failed to list folder files' };
  }
};
