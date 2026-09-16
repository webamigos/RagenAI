import {
  JobFailure,
  type JobContext,
  type ScrapeWebsitePayload,
} from '@ragenai/jobs';

import { type Document } from '../types/Document.js';

import type * as activities from '../activities/index.js';
import { EmbeddingStatus, FileType, ParsingStatus } from '../types/UserFile.js';
import { CHUNK_SETTINGS } from '../utils/splitters.js';
import { WebsiteLoaderMode } from '../types/WebsiteLoaderMode.js';
import {
  INGEST_CANCELLED_FAILURE_TYPE,
  isIngestCancellation,
  isNonRetryable,
  type EmbeddingStage,
} from './ingest-cancellation.js';

export async function scrapeWebsite(
  payload: ScrapeWebsitePayload,
  ctx: JobContext,
): Promise<string> {
  const {
    // activities/db
    bindFileWithDocument,
    createFileRecord,
    updateBinaryInfo,
    updateEmbeddingStatus,
    updateFileSize,
    updateParsingStatus,
    updateWorkflowId,

    // activities/documents
    createMarkdownDocument,

    // activities/embeddings
    prepareMetadata,

    // activities/loaders
    loadWebsite,

    // activities/notifications
    // sendErrorNotification,
    // sendInfoNotification,
    sendSuccessNotification,

    // activities/meilisearch
    addDocumentsToVectorStore,
    deleteDocumentVectors,

    // activities/splitters
    splitText,
  } = ctx.steps<typeof activities>({
    // RetryPolicy specifies how to automatically handle retries if an Activity fails.
    retry: {
      initialInterval: '1 second',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 5,
    },
    startToCloseTimeout: '1 minute',
  });

  const { url, mode, orgId, projectId } = payload;

  if (mode !== WebsiteLoaderMode.CRAWL && mode !== WebsiteLoaderMode.SCRAPE) {
    throw JobFailure.nonRetryable('Invalid crawl mode');
  }

  const fileType = FileType.URL;

  const fileRow = await createFileRecord({
    fileName: `${url} | ${mode}`,
    fileSize: 0, // update in loader
    fileType: FileType.URL,
    orgId,
    projectId,
  });

  const [fileRecord] = fileRow;
  const fileId = fileRecord.id;

  await updateBinaryInfo({
    fileId,
    orgId,
    isBinary: false,
  });

  // Unlike runFileEmbeddings, this workflow creates its own UserFile row, so
  // apps/web has no fileId to persist workflowId against at start time —
  // this is the one place that can do it, using the workflow's own id.
  await updateWorkflowId({
    fileId,
    orgId,
    workflowId: ctx.runId,
  });

  const splitterSettings =
    CHUNK_SETTINGS[fileType as keyof typeof CHUNK_SETTINGS];

  // ==== CANCELLATION: cooperative, not preemptive — see ./ingest-cancellation.
  // There is no engine-side half any more: the cancel command writes CANCELLED
  // to the row and this reads it, so both runtimes stop at the same points.
  // The file is passed rather than derived from the run id, because
  // `workflow_id` has no index and this runs about five times per ingest.
  let stage: EmbeddingStage = 'parsing';
  const enterStage = (next: EmbeddingStage): void => {
    stage = next;
    ctx.progress(next);
  };

  async function checkCancelled(): Promise<void> {
    if (!(await ctx.checkCancelled({ fileId, orgId }))) {
      return;
    }
    if (stage === 'parsing') {
      await updateParsingStatus({
        fileId,
        orgId,
        status: ParsingStatus.CANCELLED,
      });
    } else {
      await updateEmbeddingStatus({
        fileId,
        orgId,
        status: EmbeddingStatus.CANCELLED,
      });
    }
    throw JobFailure.nonRetryable('Embedding cancelled by user', {
      type: INGEST_CANCELLED_FAILURE_TYPE,
    });
  }

  await checkCancelled();

  // ==== SCRAPE AND PARSE WEBSITE
  let docs: Document[] = [];
  try {
    const rawDocs = await loadWebsite({
      url,
      // The payload carries the wire value — `'crawl' | 'scrape'`, which is
      // what a producer sends and what survives JSON — while the loader takes
      // the worker's own enum. Same two strings; TypeScript will not widen one
      // into the other, and the guard against a third value is the check above,
      // which runs before anything reaches here.
      mode: mode as WebsiteLoaderMode,
      orgId,
      projectId,
    });

    const combinedMarkdown = rawDocs.map((doc) => doc.pageContent).join('\n\n');

    const enhancedMarkdown = `URL: ${url}\nMode: ${
      mode
    }\nProcessed at: ${new Date().toISOString()}\n\n${combinedMarkdown}`;

    await updateFileSize({
      fileId,
      orgId,
      fileSize: enhancedMarkdown.length,
    });

    const [documentRow] = await createMarkdownDocument({
      title: `${url} | ${mode}`,
      orgId: orgId,
      content: enhancedMarkdown,
      fileId: fileId,
      projectId: projectId,
    });

    if (documentRow) {
      await bindFileWithDocument({ fileId, documentId: documentRow.id, orgId });
    }

    docs = await splitText({ fileType, rawDocs, splitterSettings });

    await updateParsingStatus({
      fileId,
      orgId,
      status: ParsingStatus.COMPLETED,
    });
  } catch (parsingError) {
    // See parse-and-embed.ts's equivalent catch: checkCancelled() already
    // recorded CANCELLED before throwing, so rethrow it unchanged rather
    // than overwriting that with FAILED.
    if (isIngestCancellation(parsingError)) {
      throw parsingError;
    }
    await updateParsingStatus({
      fileId,
      orgId,
      status: ParsingStatus.FAILED,
    });
    // Any other nonRetryable failure keeps its own message/flag instead of
    // being rewrapped into a generic, retryable-looking one.
    if (isNonRetryable(parsingError)) {
      throw parsingError;
    }
    throw new JobFailure(
      `Website parsing failed for ${url}: ${parsingError instanceof Error ? parsingError.message : String(parsingError)}`,
    );
  }

  // ==== PREPARE DOCUMENTS FOR VECTOR STORE

  const updatedDocs = await prepareMetadata({
    docs,
    fileRecord: {
      id: fileRecord.id,
      fileName: fileRecord.file_name,
      organizationId: fileRecord.organization_id,
      projectId: fileRecord.project_id,
    },
    fileType,
    splitterSettings,
  });

  enterStage('embedding');
  await checkCancelled();

  // ==== GENERATE EMBEDDINGS AND STORE IN VECTOR DB
  try {
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.STARTED,
    });

    // See parse-and-embed.ts: point ids are random uuids, so an upsert cannot
    // replace an earlier ingest of the same file. A re-scrape of a page that
    // has changed would otherwise leave the old text in the index beside the
    // new, and a redelivered job would duplicate every chunk.
    await deleteDocumentVectors({ orgId, fileId });

    await addDocumentsToVectorStore({
      orgId,
      docs: updatedDocs,
    });

    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.COMPLETED,
    });
  } catch (embeddingError) {
    if (isIngestCancellation(embeddingError)) {
      throw embeddingError;
    }
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.FAILED,
    });
    if (isNonRetryable(embeddingError)) {
      throw embeddingError;
    }
    throw new JobFailure(
      `Embedding failed for website ${url}: ${embeddingError instanceof Error ? embeddingError.message : String(embeddingError)}`,
    );
  }

  await sendSuccessNotification({
    content: `Website parsed and embedded`,
    intlKey: `website-parsed-and-embedded`,
    meta: {
      forceRefresh: true,
    },
  });

  return `Success: ${url}`;
}
