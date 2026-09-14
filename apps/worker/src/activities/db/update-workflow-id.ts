import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';
import { type UserFile } from '../../types/UserFile.js';

export async function updateWorkflowId({
  fileId,
  orgId,
  workflowId,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  workflowId: string;
}) {
  logger.info(`Persisting workflowId for file ${fileId}`);

  return await db.updateWorkflowId({
    where: {
      fileId,
      orgId,
    },
    data: {
      workflowId,
    },
  });
}
