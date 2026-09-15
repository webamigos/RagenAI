import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import { jobs } from '@/libs/jobs';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';
import { persistUserFileUpdateWithRetry } from '@/features/documents/utils/persist-user-file-update-with-retry';
import { resetIngestStatusForNewRun } from '@/features/documents/utils/reset-ingest-status-for-new-run';
import { toRunFileEmbeddingsPayload } from '@ragenai/jobs';

export async function reembedFileCommand(
  fileId: string,
  organizationId: string,
): Promise<{ workflowId: string }> {
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId },
  });

  if (!file) {
    throw new NotFoundException(`File not found: ${fileId}`);
  }

  const workflowId = `reembed-${nanoid()}`;

  // Before the run starts, not after: a previously cancelled file carries a
  // CANCELLED status that the worker's status writers will not write over, so
  // without this the new run would record nothing. `bulkReembedFilesAction`
  // and `reembedFolderWithPolicyCommand` already did this inline.
  await resetIngestStatusForNewRun({ fileId, organizationId });

  try {
    await jobs().start(
      Workflow.RUN_FILE_EMBEDDINGS,
      workflowId,
      toRunFileEmbeddingsPayload(file, { requestId: workflowId }),
    );
  } catch (wfErr) {
    logger.error({ err: wfErr, fileId }, 'Failed to start re-embed workflow');
    throw wfErr;
  }

  // Retried best-effort: lets a later cancelFileEmbeddingCommand find this run.
  await persistUserFileUpdateWithRetry({
    fileId,
    organizationId,
    data: { workflowId },
    logContext: { workflowId },
  });

  return { workflowId };
}
