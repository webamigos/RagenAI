import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { UserFile, ParsingStatus } from '../../types/UserFile';

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
