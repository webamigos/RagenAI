import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';
import { type UserFile, type EmbeddingStatus } from '../../types/UserFile.js';

export async function updateEmbeddingStatus({
  fileId,
  orgId,
  status,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  status: EmbeddingStatus;
}) {
  logger.info(`Changing embedding status of file ${fileId} to ${status}`);

  return await db.updateEmbeddingStatus({
    where: {
      fileId,
      orgId,
    },
    data: {
      embedding_status: status,
    },
  });
}
