import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { type UserFile } from '../../types/UserFile';

export async function getFileRecord(fileId: UserFile['id']) {
  logger.info(`Fetching file ${fileId}`);

  return await db.getUserFile(fileId);
}
