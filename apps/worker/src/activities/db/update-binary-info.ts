import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { type UserFile } from '../../types/UserFile';

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
