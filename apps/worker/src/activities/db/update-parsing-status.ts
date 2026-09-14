import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';
import { type UserFile, type ParsingStatus } from '../../types/UserFile.js';

export async function updateParsingStatus({
  fileId,
  orgId,
  status,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  status: ParsingStatus;
}) {
  logger.info(`Changing parsing status of file ${fileId} to ${status}`);

  return await db.updateParsingStatus({
    where: {
      fileId,
      orgId,
    },
    data: {
      parsing_status: status,
    },
  });
}
