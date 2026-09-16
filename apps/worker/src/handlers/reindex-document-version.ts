import {
  JobFailure,
  type JobContext,
  type ReindexDocumentVersionPayload,
} from '@ragenai/jobs';

import type * as activities from '../activities/index.js';
import { type Document } from '../types/Document.js';
import { EmbeddingStatus, FileType } from '../types/UserFile.js';
import { CHUNK_SETTINGS } from '../utils/splitters.js';

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
  ctx: JobContext,
): Promise<string> {
  const {
    detectDocumentLanguage,
    updateEmbeddingStatus,
    updateLanguage,
    prepareMetadata,
    addDocumentsToVectorStore,
    deleteDocumentVectors,
    getDocumentContent,
    splitText,
  } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '1 second',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '10 minutes',
  });

  const { orgId, fileId, fileName, projectId, documentId } = payload;

  // Read rather than received. Every producer persists the document before it
  // enqueues — a rollback makes the version active first, apply-suggestions
  // writes the optimized text first — so this embeds what the document says
  // now. The payload version embedded what it said when the job was queued,
  // which two rollbacks in quick succession could get wrong.
  const document = await getDocumentContent({ documentId, orgId });
  const content = document?.content ?? '';

  if (content.trim() === '') {
    throw JobFailure.nonRetryable(
      `Refusing to re-index file ${fileId} with empty content — this would leave the document unsearchable. Document ${documentId} is ${document ? 'empty' : 'missing'}.`,
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

  // ==== DETECT DOCUMENT LANGUAGE (best-effort, same pattern as parse-and-embed)
  // Re-run on every reindex so the tag reflects the *current* content —
  // unlike the summary/RAG score, this has no LLM cost, so there is no
  // reason to let it go stale the way those two currently do here.
  let language: string | null = null;
  let languageDetectionFailed = false;
  try {
    language = await detectDocumentLanguage({
      documentText: content,
      fileName,
    });
  } catch (languageError) {
    languageDetectionFailed = true;
    ctx.log.warn(
      `Language detection failed for file ${fileId}: ${languageError instanceof Error ? languageError.message : String(languageError)}`,
    );
  }

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
        language,
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

    // Persisted even when null: reindex's whole point is that content
    // changed, so a version whose new text is undetermined must clear
    // whatever language tag the *previous* version left behind rather than
    // keeping it. Skipped only when detection itself failed, so a transient
    // error doesn't overwrite a still-valid tag with null.
    if (!languageDetectionFailed) {
      try {
        await updateLanguage({ fileId, orgId, language });
      } catch (languagePersistError) {
        ctx.log.warn(
          `Failed to persist language for file ${fileId}: ${languagePersistError instanceof Error ? languagePersistError.message : String(languagePersistError)}`,
        );
      }
    }
  } catch (error) {
    // The delete may already have gone through, so the document can be left
    // with no chunks at all. FAILED is the honest state for that: it is visible
    // in the UI, and re-running the workflow recovers it.
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.FAILED,
    });
    throw new JobFailure(
      `Re-index failed for file ${fileId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return fileId;
}
