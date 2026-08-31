import { db } from '../../services/db';
import { UserFile } from '../../types/UserFile';

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
