import { aws } from '../../services/aws';
import { logger } from '../../services/logger';
import { getFileExtension } from '../../utils/get-file-extension';
import { GetFileFromS3Params } from './types';

export async function getFileFromS3({
  orgId,
  fileId,
  fileName,
}: GetFileFromS3Params) {
  if (!fileName) {
    throw new Error(`Missing fileName for file ${fileId} in org ${orgId}`);
  }

  logger.info(`Fetching file from S3 ${fileName}`);

  const fileExtension = getFileExtension(fileName);
  const s3FileName = fileExtension ? `${fileId}.${fileExtension}` : `${fileId}`;

  try {
    return await aws.getFileFromS3(orgId, s3FileName);
  } catch (error) {
    logger.error(
      { err: error, orgId, fileId, fileName },
      'Failed to fetch file from S3',
    );
    throw error;
  }
}
