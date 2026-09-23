import db from '@ragenai/prisma-client';

import { logger } from '@/app/lib/utils/logger';
import { assertCanManageDocuments } from '@/features/subscriptions/services/feature-guards';

import { reembedFileCommand } from './reembed-file-command';

export type SendStagedResult = { sent: string[]; skipped: string[] };

/**
 * Send documents staged into Ragen Brain to the knowledge base (spec F5):
 * the ordinary ingest, with the knowledge-base destination, so their chunks
 * are exactly what an upload there would have produced.
 *
 * **It selects `STAGED` and nothing else.** A withdrawn page's file is
 * `WITHDRAWN`, a curated document taken out of retrieval is `WITHDRAWN` too,
 * and neither is promoted by this — the one action meant to rescue staged
 * uploads must not re-index what a person deliberately took out. Ids that do
 * not name a staged file of this organization come back as `skipped`.
 *
 * Not gated on the `brain` flag: an organization that stages uploads and
 * later turns Brain off must still be able to get its documents indexed.
 * Idempotent — a file already sent is no longer `STAGED`, so a second click
 * skips it.
 *
 * **Who may send is the caller's answer, passed as `onlyOwnedBy`**: an
 * organization manager sends any staged file (`null`), anyone else only
 * the ones they uploaded — the rule the neighbouring bulk delete and move
 * follow. Staging is a deliberate "not yet"; a member must not be able to
 * push someone else's staged document into retrieval.
 */
export async function sendStagedToKnowledgeBaseCommand(input: {
  organizationId: string;
  fileIds: string[];
  onlyOwnedBy: string | null;
}): Promise<SendStagedResult> {
  const { organizationId } = input;
  await assertCanManageDocuments(organizationId);
  const ids = [...new Set(input.fileIds)];
  const staged = await db.userFile.findMany({
    where: {
      organizationId,
      id: { in: ids },
      embeddingStatus: 'STAGED',
      publishedPages: { none: {} },
      ...(input.onlyOwnedBy === null ? {} : { ownerId: input.onlyOwnedBy }),
    },
    select: { id: true, metadata: true },
  });
  const sent: string[] = [];
  for (const file of staged) {
    const metadata =
      file.metadata && typeof file.metadata === 'object'
        ? { ...(file.metadata as Record<string, unknown>) }
        : {};
    metadata.intake = 'knowledge-base';
    try {
      // The destination first, then the ingest: the worker reads the row,
      // and a run that still saw `brain` would stage the file again.
      await db.userFile.updateMany({
        where: { organizationId, id: file.id, embeddingStatus: 'STAGED' },
        data: { metadata: metadata as object },
      });
      await reembedFileCommand(file.id, organizationId);
      sent.push(file.id);
    } catch (error) {
      logger.error(
        {
          organizationId,
          fileId: file.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Could not send a staged document to the knowledge base',
      );
      // Back to staged, so sending it again works: the destination was
      // rewritten and the status reset before the job failed to start, and
      // a file in that state is neither staged nor on its way anywhere.
      await db.userFile
        .updateMany({
          where: {
            organizationId,
            id: file.id,
            embeddingStatus: { in: ['STAGED', 'NOT_STARTED'] },
          },
          data: {
            embeddingStatus: 'STAGED',
            metadata: { ...metadata, intake: 'brain' } as object,
          },
        })
        .catch((restoreError: unknown) => {
          logger.error(
            {
              organizationId,
              fileId: file.id,
              error:
                restoreError instanceof Error
                  ? restoreError.message
                  : String(restoreError),
            },
            'Could not put a staged document back after a failed send',
          );
        });
    }
  }
  const sentSet = new Set(sent);
  return { sent, skipped: ids.filter((id) => !sentSet.has(id)) };
}
