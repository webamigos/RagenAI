import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import {
  PiiPolicy,
  EmbeddingStatus,
  ParsingStatus,
} from '@/generated/prisma/client';
import { jobs } from '@/libs/jobs';
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

    // Before the job starts, and not best-effort. The ingest reads the policy
    // off the row, so a job that began before this landed would mask under the
    // *old* policy — a file the operator has just marked STRICT ingested as
    // TOXIC_ONLY, silently and only for the run that mattered. It was written
    // after the start and with a retry that gives up, which made that a race
    // rather than an impossibility.
    //
    // The status reset comes with it: the worker's status writers refuse to
    // write over CANCELLED, so a previously cancelled file needs this cleared
    // before its new run records anything.
    try {
      await db.userFile.update({
        where: { id: file.id, organizationId },
        data: {
          piiPolicy,
          embeddingStatus: EmbeddingStatus.NOT_STARTED,
          parsingStatus: ParsingStatus.NOT_STARTED,
          embeddingStartedAt: null,
          embeddingCompletedAt: null,
          embeddingFailedAt: null,
          workflowId,
        },
      });
    } catch (err) {
      logger.error(
        { err, fileId: file.id },
        'reembedFolderWithPolicyCommand: could not persist the policy before starting',
      );
      failed.push({
        fileId: file.id,
        fileName: file.fileName ?? file.id,
        error: 'policy_write_failed',
      });
      continue;
    }

    try {
      await jobs().start(Workflow.RUN_FILE_EMBEDDINGS, workflowId, {
        fileId: file.id,
        orgId: organizationId,
      });
    } catch (err) {
      logger.error(
        { err, fileId: file.id },
        'reembedFolderWithPolicyCommand: job start failed',
      );

      // The id was reserved on the row before the start, so a start that
      // failed leaves the file pointing at a run that does not exist — and a
      // later cancel would look it up and find nothing. Cleared conditionally,
      // matching this attempt's id: if a newer re-embed has already claimed
      // the row, that one owns it and must not be unhooked by this failure.
      await db.userFile
        .updateMany({
          where: { id: file.id, organizationId, workflowId },
          data: { workflowId: null },
        })
        .catch((clearErr: unknown) => {
          // Best-effort by design: the file is already being reported as
          // failed, and turning a cleanup miss into a second error would hide
          // the one the caller needs.
          logger.warn(
            { err: clearErr, fileId: file.id, workflowId },
            'reembedFolderWithPolicyCommand: could not clear the reserved run id',
          );
        });

      failed.push({
        fileId: file.id,
        fileName: file.fileName ?? file.id,
        error: 'workflow_start_failed',
      });
      continue;
    }
    succeeded.push(file.id);
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

  const allSucceeded: string[] = [];
  const allFailed: ReembedFailure[] = [];

  const mainResult = await reembedSingleFolder(
    folderId,
    organizationId,
    piiPolicy,
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
