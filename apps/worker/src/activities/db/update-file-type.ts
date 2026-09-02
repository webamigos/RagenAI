import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { type FileType, type UserFile } from '../../types/UserFile';

export async function updateFileType({
  fileId,
  orgId,
  type,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  type: FileType;
}) {
  logger.info(
    { fileId, orgId, type },
    `Updating file type of file ${fileId} to ${type}`,
  );

  return await db.updateFileType({
    where: {
      fileId,
      orgId,
    },
    data: {
      type,
    },
  });
}
