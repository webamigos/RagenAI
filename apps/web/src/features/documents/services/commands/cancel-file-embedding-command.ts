import db from '@ragenai/prisma-client';
import {
  getTemporalClient,
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
} from '@/libs/temporal';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

/**
 * Sends the `cancelEmbedding` signal to the runFileEmbeddings/scrapeWebsite
 * workflow ingesting this file. Cancellation is cooperative — see
 * apps/worker/src/workflows/signals.ts — so it takes effect at the
 * workflow's next checkpoint, not immediately.
 */
export async function cancelFileEmbeddingCommand(
  fileId: string,
  organizationId: string,
): Promise<void> {
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId },
    select: { workflowId: true },
  });

  if (!file) {
    throw new NotFoundException(`File not found: ${fileId}`);
  }

  if (!file.workflowId) {
    throw new Error(
      `File ${fileId} has no recorded embedding workflow to cancel — it may predate this feature, or its ingest already finished`,
    );
  }

  const client = getTemporalClient();
  try {
    const handle = client.workflow.getHandle(file.workflowId);
    await handle.signal(ACTIVITY_CANCEL_EMBEDDING_COMMAND);
  } catch (err) {
    // The workflow may already have completed and fallen out of Temporal's
    // retention window — that isn't an operational failure worth alarming on.
    if (err instanceof Error && err.name === 'WorkflowNotFoundError') {
      throw new NotFoundException(
        `Embedding workflow ${file.workflowId} for file ${fileId} was not found — it may have already finished`,
      );
    }
    logger.error(
      { err, fileId, workflowId: file.workflowId },
      'Failed to signal cancelEmbedding',
    );
    throw err;
  }
}
