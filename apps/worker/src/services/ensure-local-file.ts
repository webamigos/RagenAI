import fs from 'fs';
import path from 'path';

import { aws } from './aws';
import { logger } from './logger';
import { TMP_DIR } from '../utils/cleanup-tmp';
import { getFileExtension } from '../utils/get-file-extension';

export type FileLocator = {
  orgId: string;
  fileId: string;
  fileName: string;
};

/**
 * Returns the deterministic local path for a file.
 *
 * The path is keyed on (fileId, ext) so any activity running on the same
 * worker host can reuse the same scratch file across the workflow, while
 * different files never collide. fileId is a UUID so orgId is not needed
 * for uniqueness.
 */
export const localPathFor = ({ fileId, fileName }: FileLocator): string => {
  if (fileId.includes('/') || fileId.includes('\\') || fileId.includes('..')) {
    throw new Error(`Invalid fileId: ${fileId}`);
  }
  const ext = getFileExtension(fileName);
  const basename = ext ? `${fileId}.${ext}` : fileId;
  return path.join(TMP_DIR, basename);
};

/**
 * Ensures the file exists locally on the current worker host.
 *
 * Activities run on whichever worker pod the Temporal task scheduler picks,
 * so passing local paths between activities is unsafe — a path written by
 * one activity may not exist on the host running the next one (different
 * pod, retry after restart, /tmp wiped on redeploy, etc.).
 *
 * Each activity that needs the file should call this at its start. The first
 * caller on a host downloads from S3; subsequent callers reuse the existing
 * local file.
 */
export const ensureLocalFile = async (
  locator: FileLocator,
): Promise<string> => {
  const localPath = localPathFor(locator);

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  const ext = getFileExtension(locator.fileName);
  const s3FileName = ext ? `${locator.fileId}.${ext}` : locator.fileId;

  logger.info(
    { localPath, s3FileName, orgId: locator.orgId },
    'Local file missing, downloading from S3',
  );

  await aws.downloadToLocalFile(locator.orgId, s3FileName, localPath);
  return localPath;
};

/**
 * Removes the deterministic local file for a locator. Safe to call when the
 * file does not exist.
 */
export const removeLocalFile = async (locator: FileLocator): Promise<void> => {
  const localPath = localPathFor(locator);
  try {
    await fs.promises.unlink(localPath);
    logger.info({ localPath }, 'Removed temporary file');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      logger.warn({ err, localPath }, 'Failed to remove temporary file');
    }
  }
};
