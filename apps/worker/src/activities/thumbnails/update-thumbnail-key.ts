import { db } from '../../services/db';
import { logger } from '../../services/logger';

type UpdateThumbnailKeyParams = {
  fileId: string;
  orgId: string;
  thumbnailS3Key: string;
};

export async function updateThumbnailKey({
  fileId,
  orgId,
  thumbnailS3Key,
}: UpdateThumbnailKeyParams): Promise<void> {
  logger.info(`Updating thumbnail key for file ${fileId} in org ${orgId}`);

  await db.updateThumbnailKey({
    where: { fileId, orgId },
    data: { thumbnailS3Key },
  });
}
