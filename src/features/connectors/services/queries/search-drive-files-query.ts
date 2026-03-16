import { logger } from '@/app/lib/utils/logger';
import { getDriveConnectorQuery } from './get-drive-connector-query';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';

export type DriveFile = {
  id: string;
  name: string;
  mime_type: string;
  icon: string;
  modified_time: string;
  size: number | null;
  web_view_link: string;
  icon_link: string;
  owner: string;
};

export type DriveSearchResponse = {
  success: boolean;
  files?: DriveFile[];
  count?: number;
  next_page_token?: string;
  error?: string;
};

export const searchDriveFilesQuery = async (
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
      customerId: connector.customerId,
      query,
      page_size: '20',
      mime_type: 'application/vnd.google-apps.document',
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
        'Google Drive search returned error status',
      );
      return { success: false, error: 'Failed to search Google Drive' };
    }
    const data: DriveSearchResponse = await response.json();
    if (!data.success) {
      logger.error({ error: data.error }, 'Google Drive search API error');
      return {
        success: false,
        error: data.error || 'Failed to search Google Drive',
      };
    }
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Error searching Google Drive');
    return { success: false, error: 'Failed to search Google Drive' };
  }
};
