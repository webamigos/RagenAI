import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import {
  PiiPolicy,
  EmbeddingStatus,
  ParsingStatus,
} from '@/generated/prisma/client';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';
import { persistUserFileUpdateWithRetry } from '@/features/documents/utils/persist-user-file-update-with-retry';

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

async function reembedSingleFolder(
  folderId: string,
  organizationId: string,
  piiPolicy: PiiPolicy,
  client: ReturnType<typeof getTemporalClient>,
): Promise<{ succeeded: string[]; failed: ReembedFailure[] }> {
  const files = await db.userFile.findMany({
    where: { folderId, organizationId, isUploaded: true },
  });

  if (files.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const succeeded: string[] = [];
  const failed: ReembedFailure[] = [];

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
    // Retried best-effort: a transient failure here would otherwise
    // silently leave both the status reset and workflowId (needed for
    // later cancellation) unset, despite the workflow already running.
    await persistUserFileUpdateWithRetry({
      fileId: file.id,
      organizationId,
      data: {
        piiPolicy,
        embeddingStatus: EmbeddingStatus.NOT_STARTED,
        parsingStatus: ParsingStatus.NOT_STARTED,
        embeddingStartedAt: null,
        embeddingCompletedAt: null,
        embeddingFailedAt: null,
        workflowId,
      },
      logContext: { workflowId, folderId },
    });
  }

  return { succeeded, failed };
}

export async function reembedFolderWithPolicyCommand(
  folderId: string,
  organizationId: string,
  piiPolicy: PiiPolicy,
  recursive: boolean = false,
): Promise<ReembedFolderResult> {
  await db.documentFolder.update({
    where: { id: folderId, organizationId },
    data: { piiPolicy },
  });

  const client = getTemporalClient();
  const allSucceeded: string[] = [];
  const allFailed: ReembedFailure[] = [];

  const mainResult = await reembedSingleFolder(
    folderId,
    organizationId,
    piiPolicy,
    client,
  );
  allSucceeded.push(...mainResult.succeeded);
  allFailed.push(...mainResult.failed);

  if (recursive) {
    const mainFolder = await db.documentFolder.findFirst({
      where: { id: folderId, organizationId },
      select: { path: true },
    });

    if (!mainFolder) {
      throw new Error(
        `reembedFolderWithPolicyCommand: folder ${folderId} not found during recursive phase`,
      );
    }
    const subfolderPathPrefix = `${mainFolder.path}${folderId}/`;
    const subfolders = await db.documentFolder.findMany({
      where: {
        organizationId,
        path: { startsWith: subfolderPathPrefix },
      },
    });

    for (const subfolder of subfolders) {
      /*
        Compare effective policies, not stored ones.

        `piiPolicy` is nullable — null means the folder overrides nothing and
        resolves to the same fallback `getFolderPiiPolicyQuery` applies. A null
        subfolder under a TOXIC_ONLY target is therefore already on the target
        policy, and treating it as different costs twice: it re-embeds every
        file in it for no change in outcome, and it stamps an explicit override
        onto a folder that had none — which is a policy tag back in the rail,
        put there by a recursive apply nobody aimed at that folder.
      */
      const effective = subfolder.piiPolicy ?? PiiPolicy.TOXIC_ONLY;
      if (effective === piiPolicy) {
        continue;
      }
      await db.documentFolder.update({
        where: { id: subfolder.id, organizationId },
        data: { piiPolicy },
      });
      const subResult = await reembedSingleFolder(
        subfolder.id,
        organizationId,
        piiPolicy,
        client,
      );
      allSucceeded.push(...subResult.succeeded);
      allFailed.push(...subResult.failed);
    }
  }

  return {
    succeeded: allSucceeded,
    failed: allFailed,
    total: allSucceeded.length + allFailed.length,
  };
}
