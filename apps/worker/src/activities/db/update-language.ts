import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';
import { type UserFile } from '../../types/UserFile.js';

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
