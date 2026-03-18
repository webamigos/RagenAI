import { logger } from '@/app/lib/utils/logger';
import { getDriveConnectorQuery } from './get-drive-connector-query';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';
import type {
  DriveFile,
  DriveSearchResponse,
} from './search-drive-files-query';

export type { DriveFile, DriveSearchResponse };

export const searchDriveFoldersQuery = async (
  organizationId: string,
  userId: string,
  query: string = '',
  pageToken?: string,
): Promise<DriveSearchResponse> => {
  const connector = await getDriveConnectorQuery(organizationId, userId);
  if (!connector) {
    return { success: false, error: 'Google Drive not connected' };
  }

  try {
    const params = new URLSearchParams({
      customer_id: connector.customerId,
      query,
      page_size: '20',
      mime_type: 'application/vnd.google-apps.folder',
    });
    if (pageToken) {
      params.set('page_token', pageToken);
    }

    const response = await fetchWithTimeout(
      `${connector.baseUrl}/drive/search?${params}`,
    );
    if (!response.ok) {
      logger.error(
        { status: response.status },
        'Google Drive folder search returned error status',
      );
      return { success: false, error: 'Failed to search Google Drive folders' };
    }
    const data: DriveSearchResponse = await response.json();
    if (!data.success) {
      logger.error(
        { error: data.error },
        'Google Drive folder search API error',
      );
      return {
        success: false,
        error: data.error || 'Failed to search Google Drive folders',
      };
    }
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Error searching Google Drive folders');
    return { success: false, error: 'Failed to search Google Drive folders' };
  }
};
