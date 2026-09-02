import { proxyActivities } from '@temporalio/workflow';
import { ApplicationFailure } from '@temporalio/common';
import { type Document } from '../types/Document';

import type * as activities from '../activities';
import { EmbeddingStatus, FileType, ParsingStatus } from '../types/UserFile';
import { CHUNK_SETTINGS } from '../utils/splitters';
import { type WebsiteDocumentLoaderParams } from '../services/document-loaders/website-loader';
import { WebsiteLoaderMode } from '../types/WebsiteLoaderMode';

type ScrapeWebsitePayload = WebsiteDocumentLoaderParams;

export async function scrapeWebsite(
  payload: ScrapeWebsitePayload,
): Promise<string> {
  const {
    // activities/db
    bindFileWithDocument,
    createFileRecord,
    updateBinaryInfo,
    updateEmbeddingStatus,
    updateFileSize,
    updateParsingStatus,

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

    // activities/splitters
    splitText,
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

  const { url, mode, orgId, projectId } = payload;

  if (mode !== WebsiteLoaderMode.CRAWL && mode !== WebsiteLoaderMode.SCRAPE) {
    throw new ApplicationFailure('Invalid crawl mode');
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

  const splitterSettings =
    CHUNK_SETTINGS[fileType as keyof typeof CHUNK_SETTINGS];

  // ==== SCRAPE AND PARSE WEBSITE
  let docs: Document[] = [];
  try {
    const rawDocs = await loadWebsite({
      url,
      mode,
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
      await bindFileWithDocument({ fileId, documentId: documentRow.id });
    }

    docs = await splitText({ fileType, rawDocs, splitterSettings });

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

  // ==== GENERATE EMBEDDINGS AND STORE IN VECTOR DB
  try {
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.STARTED,
    });

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
    await updateEmbeddingStatus({
      fileId,
      orgId,
      status: EmbeddingStatus.FAILED,
    });
    throw new ApplicationFailure(
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
