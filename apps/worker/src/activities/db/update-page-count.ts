import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { type UserFile } from '../../types/UserFile';

export async function updatePageCount({
  fileId,
  orgId,
  pageCount,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  pageCount: number;
}) {
  logger.info(`Updating page count for file ${fileId}: ${pageCount} pages`);

  return await db.updatePageCount({
    where: {
      fileId,
      orgId,
    },
    data: {
      pageCount,
    },
  });
}
