import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { type UserFile, type EmbeddingStatus } from '../../types/UserFile';

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
