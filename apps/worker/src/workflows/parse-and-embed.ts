import { log, proxyActivities } from '@temporalio/workflow';
import { ApplicationFailure } from '@temporalio/common';
import { type Document } from '../types/Document';

import type * as activities from '../activities';
import {
  EmbeddingStatus,
  FileType,
  ParsingStatus,
  type UserFile,
} from '../types/UserFile';
import { SUPPORTED_MIME_TYPES } from '../utils/supported-mime-types';
import { CHUNK_SETTINGS } from '../utils/splitters';
import { getFileExtension } from '../utils/get-file-extension';
import { DOCLING_SUPPORTED_TYPES } from '../utils/docling';

export async function runFileEmbeddings(payload: UserFile): Promise<string> {
  const {
    // activities/db
    bindFileWithDocument,
    createInitialDocumentVersion,
    mergeFileMetadata,
    updateBinaryInfo,
    updateEmbeddingStatus,
    updateExtensionAndMime,
    updateFileType,
    updateLanguage,
    updatePageCount,
    updateParsingStatus,

    // activities/files
    checkIsBinaryFile,
    checkMimeType,
    deleteFileFromTmp,

    // activities/documents
    createMarkdownDocument,
    detectDocumentLanguage,
    generateDocumentSummary,
    scoreDocumentForRag,
    sanitizeDocuments,

    // activities/config
    getDocumentParser,

    // activities/embeddings
    prepareMetadata,

    // activities/loaders
    loadCsv,
    loadDocx,
    loadEpub,
    loadImage,
    loadSrt,
    loadText,
    loadXlsx,

    // activities/notifications
    // sendErrorNotification,
    // sendInfoNotification,
    sendSuccessNotification,

    // activities/meilisearch
    addDocumentsToVectorStore,

    // activities/splitters
    splitText,

    // activities/thumbnails
    generateAndUploadThumbnail,
    updateThumbnailKey,
  } = proxyActivities<typeof activities>({
    // RetryPolicy specifies how to automatically handle retries if an Activity fails.
    retry: {
      initialInterval: '1 second',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 5,
      // nonRetryableErrorTypes: ['InvalidAccountError', 'InsufficientFundsError'],
    },
    startToCloseTimeout: '1 minute',
  });

  // PII masking — custom backoff: 5s → 30s → 2min (Presidio may be briefly unavailable).
  // Kept separate from the main proxy so other activities are not affected by these settings.
  // applyDualContentMode is co-located here as it is part of the same PII ingestion pipeline.
  const { maskPii, applyDualContentMode } = proxyActivities<typeof activities>({
    retry: {
      initialInterval: '5 seconds',
      maximumInterval: '2 minutes',
      backoffCoefficient: 6,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '5 minutes',
  });

  // PDF loading gets extended timeout — Claude native PDF can take 30-60s for large documents.
  // Docling gets the same extended timeout — CPU-based parsing can be slow for large docs.
  const { loadPdf, loadDocling } = proxyActivities<typeof activities>({
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '2 minutes',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '10 minutes',
  });

  const fileId = payload.id;
  const fileName = payload.fileName;
  const orgId = payload.organizationId;
  const projectId = payload.projectId;

  // Locator passed to every activity that needs the underlying file.
  // Each activity calls ensureLocalFile() internally so the file is fetched
  // from S3 on whichever worker host the activity ends up running on. This
  // is the only safe way to share file content across activities — local
  // /tmp paths cannot be passed between activities because retries can land
  // on a different worker pod.
  const locator = { orgId, fileId, fileName };

  // ==== CHECK IF FILE IS BINARY (also triggers initial S3 download)
  const isBinaryFile = await checkIsBinaryFile(locator);

  await updateBinaryInfo({
    fileId,
    orgId,
    isBinary: isBinaryFile,
  });

  let fileMimeType = 'text/plain';
  let fileExtension = getFileExtension(fileName);

  // ==== CHECK MIME TYPE AND DETERMINE EXTENSION
  if (isBinaryFile) {
    const mimeType = await checkMimeType(locator);

    if (!mimeType) {
      throw new ApplicationFailure(
        `Cannot detect mime type for file ${payload.id}`,
      );
    }

    fileMimeType = mimeType.mime;
    if (mimeType.ext) {
      fileExtension = mimeType.ext;
    }
  } else {
    if (fileExtension && fileExtension.toLocaleLowerCase() === 'md') {
      fileMimeType = 'text/markdown';
    }
  }

  if (!fileExtension) {
    throw new ApplicationFailure('Cannot determine file extension');
  }

  await updateExtensionAndMime({
    fileId,
    orgId,
    ext: fileExtension,
    mime: fileMimeType,
  });

  const isSupportedMimeType =
    Object.keys(SUPPORTED_MIME_TYPES).includes(fileMimeType);

  if (!isSupportedMimeType) {
    throw new ApplicationFailure(`Unsupported mime type ${fileMimeType}`);
  }

  const fileType = SUPPORTED_MIME_TYPES[fileMimeType];

  await updateFileType({ fileId, orgId, type: fileType });

  const splitterSettings =
    CHUNK_SETTINGS[fileType as keyof typeof CHUNK_SETTINGS];

  // ==== PARSE DOCUMENT
  let docs: Document[] = [];
  let pageCount = 1;
  let parsedWithDocling = false;
  try {
    await updateParsingStatus({
      fileId,
      orgId,
      status: ParsingStatus.STARTED,
    });

    let rawDocs: Document[] = [];

    // Resolve the parser setting via an activity (process.env is not
    // available inside the Temporal workflow sandbox).
    const { parser: documentParser, strict: doclingStrict } =
      await getDocumentParser();

    // Docling is the default: it parses locally, so documents stay on the
    // deployment's own infrastructure. Formats it does not handle (SRT, EPUB)
    // fall through to their legacy loader below.
    if (documentParser === 'docling' && DOCLING_SUPPORTED_TYPES.has(fileType)) {
      try {
        rawDocs = await loadDocling({ ...locator, fileType });
        parsedWithDocling = true;
        log.info(`Parsed ${fileName} with Docling`);
      } catch (doclingError) {
        const reason =
          doclingError instanceof Error
            ? doclingError.message
            : String(doclingError);

        // The legacy PDF path sends the document to an external model. Falling
        // back to it on a Docling outage would ship the document off-site
        // exactly when local parsing is unavailable, so a deployment that must
        // not do that opts out with DOCLING_STRICT=1 and fails instead.
        if (doclingStrict) {
          throw new ApplicationFailure(
            `Docling parsing failed for ${fileName} and DOCLING_STRICT is set, ` +
              `so the ingest was not allowed to fall back to a loader that may ` +
              `send the document to an external model: ${reason}`,
          );
        }

        log.warn(
          `Docling parsing failed for ${fileName}, falling back to legacy loader. ` +
            `NOTE: for PDFs the legacy loader sends the document to an external ` +
            `model — set DOCLING_STRICT=1 to fail instead. Reason: ${reason}`,
        );
      }
    }

    if (!parsedWithDocling) {
      switch (fileType) {
        case FileType.PDF:
          rawDocs = await loadPdf({ ...locator, projectId });
          break;

        case FileType.SRT:
          rawDocs = await loadSrt(locator);
          break;

        case FileType.EPUB:
          rawDocs = await loadEpub(locator);
          break;

        case FileType.MARKDOWN:
        case FileType.TEXT:
          rawDocs = await loadText(locator);
          break;

        case FileType.IMAGE:
          rawDocs = await loadImage(locator);
          break;

        case FileType.CSV:
          rawDocs = await loadCsv(locator);
          break;

        case FileType.XLSX:
          rawDocs = await loadXlsx(locator);
          break;

        case FileType.DOCX:
          rawDocs = await loadDocx(locator);
          break;

        case FileType.PPTX:
          // PPTX is only supported via Docling — no legacy loader exists
          throw new ApplicationFailure(
            'PPTX files require DOCUMENT_PARSER=docling',
          );

        default:
          throw new ApplicationFailure('Unsupported loader');
      }
    }

    // Phase 4b — ingest sanitizer. Strip invisible payloads (zero-
    // width chars, HTML comments, control chars), normalize Unicode
    // via NFKC, and flag suspicious prompt-injection patterns. The
    // sanitized docs replace rawDocs before chunking so the LLM
    // never sees the raw text. Flagging writes to UserFile.metadata
    // and security_events inside the activity; a failure there is
    // logged but does not abort ingestion (the in-memory strip has
    // already happened at that point).
    rawDocs = await sanitizeDocuments({
      rawDocs,
      fileId,
      organizationId: orgId,
      userId: payload.userId,
      requestId: payload.requestId,
      fileName,
      fileType,
    });

    // PII masking — runs after sanitization, before chunking
    const piiPolicy = payload.piiPolicy ?? 'TOXIC_ONLY';
    const docsBeforeMasking = rawDocs.map((d) => ({
      ...d,
      metadata: { ...d.metadata },
    }));
    rawDocs = await maskPii({
      docs: rawDocs,
      piiPolicy,
      fileId,
      organizationId: orgId,
      userId: payload.userId ?? null,
      requestId: payload.requestId ?? null,
    });

    // Dual-content mode: add encrypted original to each chunk's metadata
    rawDocs = await applyDualContentMode({
      originalDocs: docsBeforeMasking,
      maskedDocs: rawDocs,
      orgId,
    });

    // ==== CALCULATE PAGE COUNT
    // PDF (legacy): use actual page count from pdf-parse metadata
    // PDF (Docling): char-based estimate (no pdf-parse metadata available)
    // Image: 1 page per file
    // Other text-based: ceil(totalChars / 3000), minimum 1
    if (fileType === FileType.PDF && !parsedWithDocling) {
      const pdfMeta = rawDocs[0]?.metadata?.pdf as
        { totalPages?: number } | undefined;
      pageCount = pdfMeta?.totalPages ?? rawDocs.length;
    } else if (fileType === FileType.IMAGE) {
      pageCount = 1;
    } else {
      const totalChars = rawDocs.reduce(
        (sum, d) => sum + d.pageContent.length,
        0,
      );
      pageCount = Math.max(Math.ceil(totalChars / 3000), 1);
    }

    docs = await splitText({
      fileType,
      rawDocs,
      splitterSettings,
      parsedWithDocling,
    });

    await updateParsingStatus({
      fileId,
      orgId,
      status: ParsingStatus.COMPLETED,
    });
  } catch (parsingError) {
    await updateParsingStatus({
      fileId,
      orgId,
      status: ParsingStatus.FAILED,
    });
    throw new ApplicationFailure(
      `Document parsing failed for file ${payload.id}: ${parsingError instanceof Error ? parsingError.message : String(parsingError)}`,
    );
  }

  // ==== GENERATE THUMBNAIL (non-critical, must not fail the workflow)
  try {
    const thumbnailS3Key = await generateAndUploadThumbnail({
      ...locator,
      fileType,
    });

    await updateThumbnailKey({
      fileId,
      orgId,
      thumbnailS3Key,
    });
  } catch (thumbnailError) {
    // Thumbnail generation is best-effort — log but don't fail the workflow
    log.warn(
      `Thumbnail generation failed for file ${fileId}: ${thumbnailError instanceof Error ? thumbnailError.message : String(thumbnailError)}`,
    );
  }

  const documentText = docs.map((d) => d.pageContent).join('\n');

  // ==== GENERATE DOCUMENT SUMMARY (ADR-16, best-effort)
  // The summary is prepended as a synthetic chunk so it participates in
  // hybrid retrieval alongside normal chunks. It is also stored on
  // UserFile.metadata.summary for UI use. Both are enrichment — failures
  // here must not fail the workflow. The activity itself catches LLM
  // errors and returns ""; this outer try-catch is defense-in-depth for
  // Temporal-level failures (task timeout, worker crash, retry exhaustion)
  // that the activity cannot catch internally.
  let summary = '';
  try {
    summary = await generateDocumentSummary({
      documentText,
      orgId,
      projectId,
      userId: payload.userId ?? null,
      fileName,
    });
  } catch (summaryError) {
    log.warn(
      `Summary generation failed for file ${fileId}: ${summaryError instanceof Error ? summaryError.message : String(summaryError)}`,
    );
  }

  const docsWithSummary: Document[] =
    summary.length > 0
      ? [{ pageContent: summary, metadata: { chunk_type: 'summary' } }, ...docs]
      : docs;

  // ==== DETECT DOCUMENT LANGUAGE (best-effort, same pattern as summary)
  // One tag per document, computed once from the same documentText used for
  // the summary/RAG-score, then threaded into fileRecord below so every
  // chunk's Qdrant payload carries it too.
  let language: string | null = null;
  try {
    language = await detectDocumentLanguage({ documentText, fileName });
  } catch (languageError) {
    log.warn(
      `Language detection failed for file ${fileId}: ${languageError instanceof Error ? languageError.message : String(languageError)}`,
    );
  }

  // ==== PREPARE DOCUMENTS FOR VECTOR STORE
  const updatedDocs = await prepareMetadata({
    docs: docsWithSummary,
    fileRecord: {
      id: fileId,
      fileName,
      organizationId: orgId,
      projectId: projectId,
      piiPolicy: payload.piiPolicy,
      language,
    },
    fileType,
    splitterSettings,
  });

  // ==== GENERATE EMBEDDINGS AND STORE IN VECTOR DB
  try {
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.STARTED,
    });

    await addDocumentsToVectorStore({
      orgId,
      projectId,
      userId: payload.userId ?? null,
      docs: updatedDocs,
    });

    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.COMPLETED,
    });
  } catch (embeddingError) {
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.FAILED,
    });
    throw new ApplicationFailure(
      `Embedding failed for file ${payload.id}: ${embeddingError instanceof Error ? embeddingError.message : String(embeddingError)}`,
    );
  }

  // Persist the summary on UserFile.metadata after embedding succeeds. This
  // runs OUTSIDE the embedding try-catch so a metadata persistence failure
  // cannot incorrectly mark embedding as FAILED. Best-effort on top of the
  // activity's own error handling.
  if (summary.length > 0) {
    try {
      await mergeFileMetadata({
        fileId,
        orgId,
        patch: { summary },
      });
    } catch (metadataError) {
      log.warn(
        `Failed to persist summary metadata for file ${fileId}: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`,
      );
    }
  }

  // ==== SCORE DOCUMENT FOR RAG (best-effort, same pattern as summary)
  // Kept for the version row created further down, so v1 carries a score from
  // the moment it exists rather than showing "no score" until the next edit.
  let ragScore: Awaited<ReturnType<typeof scoreDocumentForRag>> = null;
  try {
    ragScore = await scoreDocumentForRag({
      documentText,
      orgId,
      projectId,
      userId: payload.userId ?? null,
      fileName,
    });

    if (ragScore) {
      await mergeFileMetadata({
        fileId,
        orgId,
        patch: { ragScore, ragScoredAt: new Date().toISOString() },
      });
    }
  } catch (scoreError) {
    log.warn(
      `RAG scoring failed for file ${fileId}: ${scoreError instanceof Error ? scoreError.message : String(scoreError)}`,
    );
  }

  // Persist language (best-effort, same pattern as summary)
  if (language) {
    try {
      await updateLanguage({ fileId, orgId, language });
    } catch (languagePersistError) {
      log.warn(
        `Failed to persist language for file ${fileId}: ${languagePersistError instanceof Error ? languagePersistError.message : String(languagePersistError)}`,
      );
    }
  }

  // Persist page count (best-effort, same pattern as summary)
  try {
    await updatePageCount({ fileId, orgId, pageCount });
  } catch (pageCountError) {
    log.warn(
      `Failed to persist page count for file ${fileId}: ${pageCountError instanceof Error ? pageCountError.message : String(pageCountError)}`,
    );
  }

  /**
   * Best-effort *after* Temporal's retries, not instead of them: the activity
   * rethrows so transient failures are retried, and only an exhausted retry
   * budget lands here. A document with embeddings and no v1 is still usable,
   * and the backfill script can add one; losing the ingest would be worse.
   */
  async function seedInitialVersion(documentId: string, content: string) {
    try {
      await createInitialDocumentVersion({
        documentId,
        organizationId: orgId,
        content,
        title: fileName,
        authorId: payload.userId ?? null,
        ragScore,
      });
    } catch (versionError) {
      log.warn(
        `Initial version not created for document ${documentId}: ${
          versionError instanceof Error
            ? versionError.message
            : String(versionError)
        }`,
      );
    }
  }

  // ==== CREATE MARKDOWN DOCUMENT. NOTE: legacy PDF loader does it internally.
  // When Docling was used for PDF, we need to create the markdown document here
  // since the Docling loader doesn't do it internally.
  const shouldCreateMarkdownDoc =
    parsedWithDocling ||
    fileType === FileType.MARKDOWN ||
    fileType === FileType.SRT ||
    fileType === FileType.TEXT ||
    fileType === FileType.IMAGE ||
    fileType === FileType.CSV ||
    fileType === FileType.XLSX ||
    fileType === FileType.DOCX ||
    fileType === FileType.PPTX;

  if (shouldCreateMarkdownDoc) {
    let finalDocument = '';

    // Skip synthetic summary chunks (ADR-16) — they participate in Qdrant
    // retrieval but must NOT end up in the persisted user_documents.content
    // column or users would see the LLM summary prepended to their real
    // document text in the KB preview.
    updatedDocs.forEach((doc) => {
      if (doc.metadata?.chunk_type === 'summary') {
        return;
      }
      finalDocument += doc.pageContent + '\n';
    });

    const [documentRow] = await createMarkdownDocument({
      content: finalDocument,
      orgId: orgId,
      projectId: projectId,
      title: fileName,
      fileId: fileId,
    });

    if (documentRow) {
      await bindFileWithDocument({ fileId, documentId: documentRow.id });
      await seedInitialVersion(documentRow.id, finalDocument);
    }
  } else if (payload.documentId) {
    // The legacy PDF loader creates the UserDocument itself, so this is the
    // only place its history can be started.
    await seedInitialVersion(payload.documentId, documentText);
  }

  await sendSuccessNotification({
    content: `Document "${fileName}" parsed and embedded`,
    intlKey: `document-parsed-and-embedded`,
    meta: {
      forceRefresh: true,
    },
  });

  // ==== FILE IS NOT NEEDED ANYMORE - REMOVE IT
  await deleteFileFromTmp(locator);

  return `success! ${fileId}, ${payload.fileName}`;
}
