import { logger } from '@/app/lib/utils/logger';
import { getDriveConnectorQuery } from './get-drive-connector-query';

export type DriveContentResponse = {
  success: boolean;
  file_id?: string;
  name?: string;
  mime_type?: string;
  content?: string;
  error?: string;
};

export const getDriveFileContentQuery = async (
  organizationId: string,
  userId: string,
  fileId: string,
): Promise<DriveContentResponse> => {
  const connector = await getDriveConnectorQuery(organizationId, userId);
  if (!connector) {
    return { success: false, error: 'Google Drive not connected' };
  }

  try {
    const params = new URLSearchParams({
      customer_id: connector.customer_id,
    });

    const response = await fetch(
      `${connector.baseUrl}/drive/file/${encodeURIComponent(fileId)}/content?${params}`,
    );
    if (!response.ok) {
      logger.error(
        { status: response.status, fileId },
        'Drive file content fetch returned error status',
      );
      return { success: false, error: 'Failed to fetch file content' };
    }
    const data: DriveContentResponse = await response.json();
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Drive file content');
    return { success: false, error: 'Failed to fetch file content' };
  }
};
