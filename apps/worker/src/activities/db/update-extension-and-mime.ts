import { db } from '../../services/db/index.js';
import { type UserFile } from '../../types/UserFile.js';

export async function updateExtensionAndMime({
  fileId,
  orgId,
  ext,
  mime,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  ext: string | undefined;
  mime: string;
}) {
  return await db.updateFileExtensionAndMime({
    where: {
      fileId,
      orgId,
    },
    data: {
      mime,
      ext,
    },
  });
}
