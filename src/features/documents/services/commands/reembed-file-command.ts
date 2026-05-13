import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

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

  try {
    const client = getTemporalClient();
    await client.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
      taskQueue: TASK_QUEUE_NAME,
      workflowId,
      args: [
        {
          ...file,
          uploadedAt: file.uploadedAt?.toISOString() ?? null,
          parsingStartedAt: file.parsingStartedAt?.toISOString() ?? null,
          parsingCompletedAt: file.parsingCompletedAt?.toISOString() ?? null,
          parsingFailedAt: file.parsingFailedAt?.toISOString() ?? null,
          embeddingStartedAt: file.embeddingStartedAt?.toISOString() ?? null,
          embeddingCompletedAt:
            file.embeddingCompletedAt?.toISOString() ?? null,
          embeddingFailedAt: file.embeddingFailedAt?.toISOString() ?? null,
          requestId: workflowId,
        },
      ],
    });
  } catch (wfErr) {
    logger.error({ err: wfErr, fileId }, 'Failed to start re-embed workflow');
    throw wfErr;
  }

  return { workflowId };
}
