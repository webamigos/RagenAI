import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { type UserFile } from '../../types/UserFile';

export async function updateLanguage({
  fileId,
  orgId,
  language,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  language: string | null;
}) {
  logger.info(`Updating language for file ${fileId}: ${language}`);

  return await db.updateLanguage({
    where: {
      fileId,
      orgId,
    },
    data: {
      language,
    },
  });
}
