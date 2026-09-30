import {
  JobFailure,
  type JobContext,
  type ReindexDocumentVersionPayload,
} from '@ragenai/jobs';

import type * as activities from '../activities/index.js';
import { isStagedIntake, isWithdrawnFromRetrieval } from './parse-and-embed.js';
import { type Document } from '../types/Document.js';
import { EmbeddingStatus, FileType } from '../types/UserFile.js';
import { CHUNK_SETTINGS } from '../utils/splitters.js';
import {
  computeDocumentDiagnostics,
  type DocumentDiagnostics,
} from '../services/document-diagnostics.js';

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
    computeFileAccessPrincipals,
    prepareMetadata,
    addDocumentsToVectorStore,
    deleteDocumentVectors,
    generateDocumentSummary,
    getDocumentContent,
    applyContextPrefix,
    getFileRecord,
    mergeFileMetadata,
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

  // The same masking steps, with the same policy, as `runFileEmbeddings`:
  // Presidio may be briefly away, and a re-index is an ingest of new text.
  const { maskPii, applyDualContentMode } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '5 seconds',
      maximumInterval: '2 minutes',
      backoffCoefficient: 6,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '5 minutes',
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

  // A version change never decides whether a file is searchable. A file
  // staged into Ragen Brain (spec F2) or withdrawn from retrieval (E9) stays
  // out of the index through a rollback or an applied suggestion — this was a
  // second write path into the vector store, and it indexed both, undoing a
  // person's decision as a side effect of editing the text.
  const file = await getFileRecord(fileId, orgId);
  if (file && isStagedIntake(file.metadata)) {
    await deleteDocumentVectors({ orgId, fileId });
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.STAGED,
    });
    return fileId;
  }
  if (
    file &&
    (file.embeddingStatus === EmbeddingStatus.WITHDRAWN ||
      isWithdrawnFromRetrieval(file.metadata))
  ) {
    await deleteDocumentVectors({ orgId, fileId });
    return fileId;
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
  // unlike the summary, this has no LLM cost. The RAG score is not
  // recomputed either: apps/web clears the file's copy when it creates the
  // version this job indexes.
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

  // Read after the index write, outside its try: a diagnostics failure must
  // not record FAILED on a document that was indexed.
  let indexedChunks: Document[] = [];
  let newSummary = '';

  try {
    await deleteDocumentVectors({ orgId, fileId });

    const rawDocs: Document[] = [{ pageContent: content, metadata: {} }];
    const chunks = await splitText({ fileType, rawDocs, splitterSettings });

    // Masked like an upload, on the chunks. A version's text is new text: an
    // edit or an applied suggestion can hold a name or a PESEL the original
    // never had, and this path used to index it as written — whatever the
    // file's policy said. The file's own policy decides, and it is also what
    // the chunks now carry as `pii_policy` rather than the default.
    const piiPolicy = file?.piiPolicy ?? 'TOXIC_ONLY';
    const chunksBeforeMasking = chunks.map((d) => ({
      ...d,
      metadata: { ...d.metadata },
    }));
    const maskedChunks = await maskPii({
      docs: chunks,
      piiPolicy,
      language,
      fileId,
      organizationId: orgId,
      userId: file?.ownerId ?? null,
      requestId: ctx.runId,
    });
    const docs = await applyDualContentMode({
      originalDocs: chunksBeforeMasking,
      maskedDocs: maskedChunks,
      orgId,
    });
    indexedChunks = docs;

    // ==== SUMMARY CHUNK (ADR-16), from the masked version text
    // The delete above removed the file's summary chunk with everything else,
    // and nothing put it back: an edited document lost its summary from
    // retrieval for good, and `UserFile.metadata.summary` kept describing the
    // text before the edit. Regenerated here as ingest does it — best-effort,
    // so a failed summary leaves the version indexed without one.
    let summary = '';
    try {
      summary = await generateDocumentSummary({
        documentText: docs.map((d) => d.pageContent).join('\n'),
        orgId,
        projectId,
        userId: file?.ownerId ?? null,
        fileName,
      });
    } catch (summaryError) {
      ctx.log.warn(
        `Summary generation failed for file ${fileId}: ${summaryError instanceof Error ? summaryError.message : String(summaryError)}`,
      );
    }
    newSummary = summary;
    // The same prefix an upload gets, behind the same key, so an edited
    // document keeps its context (spec 2026-09-29-contextual-chunks).
    const bodyDocs = await applyContextPrefix({
      orgId,
      docs,
      fileName,
      summary,
    }).catch((prefixError: unknown) => {
      ctx.log.warn(
        `Context prefix failed for file ${fileId}; indexing without one: ${prefixError instanceof Error ? prefixError.message : String(prefixError)}`,
      );
      return docs;
    });
    const docsWithSummary: Document[] =
      summary.length > 0
        ? [
            { pageContent: summary, metadata: { chunk_type: 'summary' } },
            ...bodyDocs,
          ]
        : bodyDocs;

    const accessibleBy = await computeFileAccessPrincipals(fileId, orgId);

    const updatedDocs = await prepareMetadata({
      docs: docsWithSummary,
      fileRecord: {
        id: fileId,
        fileName,
        organizationId: orgId,
        projectId,
        language,
        accessibleBy,
        piiPolicy,
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

  // Outside the index try, as ingest does it: a metadata write that fails
  // must not record FAILED on a version that was indexed.
  if (newSummary.length > 0) {
    try {
      await mergeFileMetadata({
        fileId,
        orgId,
        patch: { summary: newSummary },
      });
    } catch (metadataError) {
      ctx.log.warn(
        `Failed to persist summary metadata for file ${fileId}: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`,
      );
    }
  }

  // ==== DOCUMENT DIAGNOSTICS (best-effort, same pattern as parse-and-embed)
  // The chunks changed, so the previous findings describe text that is no
  // longer indexed: replaced, or cleared to null when the checks throw. No
  // parser ran — this is the version's text — so there is no fallback to see.
  let diagnostics: DocumentDiagnostics | null = null;
  try {
    diagnostics = computeDocumentDiagnostics(indexedChunks, fileType, {
      parser: 'version-text',
      doclingExpected: false,
    });
  } catch (diagnosticsError) {
    ctx.log.warn(
      `Document diagnostics failed for file ${fileId}: ${diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError)}`,
    );
  }
  try {
    await mergeFileMetadata({ fileId, orgId, patch: { diagnostics } });
  } catch (metadataError) {
    ctx.log.warn(
      `Failed to persist diagnostics for file ${fileId}: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`,
    );
  }

  return fileId;
}
