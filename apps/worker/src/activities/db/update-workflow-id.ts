import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { type UserFile } from '../../types/UserFile';

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
