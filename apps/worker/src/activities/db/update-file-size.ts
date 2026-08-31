import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { UserFile } from '../../types/UserFile';

export async function updateFileSize({
  fileId,
  orgId,
  fileSize,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  fileSize: number;
}) {
  logger.info(`Updating file size ${fileId}`);

  return await db.updateFileSize({
    where: {
      fileId,
      orgId,
    },
    data: {
      fileSize,
    },
  });
}
