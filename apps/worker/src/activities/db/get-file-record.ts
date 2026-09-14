import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';
import { type UserFile } from '../../types/UserFile.js';

export async function getFileRecord(
  fileId: UserFile['id'],
  orgId: UserFile['organizationId'],
) {
  logger.info(`Fetching file ${fileId}`);

  return await db.getUserFile(fileId, orgId);
}
