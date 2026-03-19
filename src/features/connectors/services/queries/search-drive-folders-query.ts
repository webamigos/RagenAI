import {
  searchDriveFilesQuery,
  type DriveFile,
  type DriveSearchResponse,
} from './search-drive-files-query';

export type { DriveFile, DriveSearchResponse };

export const searchDriveFoldersQuery = async (
  organizationId: string,
  userId: string,
  query: string = '',
  pageToken?: string,
): Promise<DriveSearchResponse> => {
  return searchDriveFilesQuery(
    organizationId,
    userId,
    query,
    pageToken,
    'application/vnd.google-apps.folder',
  );
};
