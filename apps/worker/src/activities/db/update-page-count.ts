import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';
import { type UserFile } from '../../types/UserFile.js';

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
