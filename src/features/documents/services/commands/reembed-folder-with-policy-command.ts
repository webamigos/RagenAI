import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import {
  type PiiPolicy,
  EmbeddingStatus,
  ParsingStatus,
} from '@/generated/prisma/client';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';

export type ReembedFailure = {
  fileId: string;
  fileName: string;
  error: string;
};

export type ReembedFolderResult = {
  succeeded: string[];
  failed: ReembedFailure[];
  total: number;
};

export async function reembedFolderWithPolicyCommand(
  folderId: string,
  organizationId: string,
  piiPolicy: PiiPolicy,
): Promise<ReembedFolderResult> {
  await db.documentFolder.update({
    where: { id: folderId, organizationId },
    data: { piiPolicy },
  });

  const files = await db.userFile.findMany({
    where: { folderId, organizationId, isUploaded: true },
  });

  if (files.length === 0) {
    return { succeeded: [], failed: [], total: 0 };
  }

  await db.userFile.updateMany({
    where: { folderId, organizationId },
    data: { piiPolicy },
  });

  const succeeded: string[] = [];
  const failed: ReembedFailure[] = [];
  const client = getTemporalClient();

  for (const file of files) {
    const workflowId = `reembed-${nanoid()}`;
    try {
      await client.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
        taskQueue: TASK_QUEUE_NAME,
        workflowId,
        args: [
          {
            ...file,
            piiPolicy,
            createdAt: file.createdAt?.toISOString() ?? null,
            updatedAt: file.updatedAt?.toISOString() ?? null,
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
    } catch (err) {
      logger.error(
        { err, fileId: file.id },
        'reembedFolderWithPolicyCommand: workflow start failed',
      );
      failed.push({
        fileId: file.id,
        fileName: file.fileName ?? file.id,
        error: 'workflow_start_failed',
      });
      continue;
    }
    succeeded.push(file.id);
    try {
      await db.userFile.update({
        where: { id: file.id },
        data: {
          embeddingStatus: EmbeddingStatus.NOT_STARTED,
          parsingStatus: ParsingStatus.NOT_STARTED,
          embeddingStartedAt: null,
          embeddingCompletedAt: null,
          embeddingFailedAt: null,
        },
      });
    } catch (dbErr) {
      logger.error(
        { err: dbErr, fileId: file.id },
        'reembedFolderWithPolicyCommand: status reset failed after workflow start',
      );
    }
  }

  return { succeeded, failed, total: files.length };
}
