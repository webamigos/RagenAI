import { proxyActivities } from '@temporalio/workflow';
import { ApplicationFailure } from '@temporalio/common';

import type * as activities from '../activities';
import { type Document } from '../types/Document';
import { EmbeddingStatus, FileType } from '../types/UserFile';
import { CHUNK_SETTINGS } from '../utils/splitters';

export type ReindexDocumentVersionPayload = {
  orgId: string;
  fileId: string;
  fileName: string;
  projectId: string | null;
  userId: string | null;
  /** The active version's text. This is the whole point — see below. */
  content: string;
};

/**
 * Re-index a document from the text of its active version.
 *
 * `runFileEmbeddings` cannot be reused for this. It downloads the stored file
 * and re-parses it, so after a rollback it would re-ingest the *original
 * upload* rather than the restored text. The alternative — overwriting the
 * stored file with the new text — destroys the user's original whenever it is
 * not already plain text: writing UTF-8 under `<id>.pdf` leaves them a PDF that
 * no longer opens.
 *
 * Deleting first is equally load-bearing. Qdrant point ids are random uuids, so
 * an upsert can never replace an earlier ingest of the same file; without the
 * delete, the rolled-back version's chunks stay in the collection next to the
 * restored ones and retrieval cites text the user has explicitly reverted.
 */
export async function reindexDocumentVersion(
  payload: ReindexDocumentVersionPayload,
): Promise<string> {
  const {
    updateEmbeddingStatus,
    prepareMetadata,
    addDocumentsToVectorStore,
    deleteDocumentVectors,
    splitText,
  } = proxyActivities<typeof activities>({
    retry: {
      initialInterval: '1 second',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '10 minutes',
  });

  const { orgId, fileId, fileName, projectId, content } = payload;

  if (content.trim() === '') {
    throw new ApplicationFailure(
      `Refusing to re-index file ${fileId} with empty content — this would leave the document unsearchable`,
    );
  }

  // Treated as Markdown regardless of the original file type: the version text
  // is what the parser already produced, so re-running a type-specific parser
  // over it would be wrong. Markdown's splitter is the one that respects the
  // heading structure that parse gave it (ADR-17/19).
  const fileType = FileType.MARKDOWN;
  const splitterSettings = CHUNK_SETTINGS[fileType];

  await updateEmbeddingStatus({
    fileId,
    orgId,
    status: EmbeddingStatus.STARTED,
  });

  try {
    await deleteDocumentVectors({ orgId, fileId });

    const rawDocs: Document[] = [{ pageContent: content, metadata: {} }];
    const docs = await splitText({ fileType, rawDocs, splitterSettings });

    const updatedDocs = await prepareMetadata({
      docs,
      fileRecord: {
        id: fileId,
        fileName,
        organizationId: orgId,
        projectId,
      },
      fileType,
      splitterSettings,
    });

    await addDocumentsToVectorStore({ orgId, docs: updatedDocs });

    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.COMPLETED,
    });
  } catch (error) {
    // The delete may already have gone through, so the document can be left
    // with no chunks at all. FAILED is the honest state for that: it is visible
    // in the UI, and re-running the workflow recovers it.
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.FAILED,
    });
    throw new ApplicationFailure(
      `Re-index failed for file ${fileId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return fileId;
}
