import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';
import { type UserFile } from '../../types/UserFile.js';

export async function updateBinaryInfo({
  fileId,
  orgId,
  isBinary,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  isBinary: boolean;
}) {
  logger.info(`Fetching file ${fileId}`);

  return await db.updateFileBinaryInfo({
    where: {
      fileId,
      orgId,
    },
    data: {
      isBinary,
    },
  });
}
