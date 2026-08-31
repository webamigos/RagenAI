import { db, FileType } from '../../services/db';
import { logger } from '../../services/logger';
import { UserFile } from '../../types/UserFile';

export async function createFileRecord({
  fileName,
  fileSize,
  fileType,
  orgId,
  projectId,
}: {
  fileName: UserFile['fileName'];
  fileSize: UserFile['fileSize'];
  fileType: FileType;
  orgId: UserFile['organizationId'];
  projectId: UserFile['projectId'];
}) {
  logger.info(`Creating file ${fileName}`);

  return await db.createFileDetailsInDB({
    file_name: fileName,
    file_size: fileSize,
    file_type: fileType,
    organization_id: orgId,
    project_id: projectId,
  });
}
