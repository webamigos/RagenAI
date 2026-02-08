import * as fs from 'node:fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { Document } from 'langchain/document';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import {
  DOCUMENT_SEARCH_QUERY_NAME,
  VECTOR_STORE_TABLE_NAME,
} from '@/libs/db/constants/vectorStore';
import { VectorStoreDocumentMetadata } from '@/app/lib/types/types';
import { createEmbeddingsInstance } from '@/app/lib/services/llm';
import { getOpenaiAPIKey } from '@/app/lib/services/settings';
import {
  setSentryClerkOrganizationTag,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { QdrantVectorStore } from '@langchain/qdrant';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getOrganizationMetadata } from '@/app/actions';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PDFOCRDocumentLoader } from '@/libs/document-loaders/pdf-ocr-loader';
import { SRTLLMDocumentLoader } from '@/libs/document-loaders/srt-llm-loader';
import { SUPPORTED_MIME_TYPES } from '@/app/lib/constants/supportedMimeTypes';
import { getFileExtension } from '@/app/lib/utils/getFileExtension';
import { WebsiteDocumentLoader } from '@/libs/document-loaders/website-loader';
import { WebsiteLoaderMode } from '@/app/contracts/DocumentLoading';

const serviceName = 'saveDataInVectorTable';

type ConvertAndStoreResult = {
  success: boolean;
  message: string;
  error?: Error;
};

type ConvertAndStoreDocumentParams = {
  fileContent: string | Buffer;
  fileName: string;
  organizationId: string;
  fileId: string;
  projectId: number;
  mimeType: string;
};

const CHUNK_SETTINGS = {
  markdown: {
    chunkSize: 800,
    chunkOverlap: 200,
  },
  epub: {
    chunkSize: 1500,
    chunkOverlap: 250,
  },
  pdf: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
  srt: {
    chunkSize: 1500,
    chunkOverlap: 250,
  },
  url: {
    chunkSize: 2500,
    chunkOverlap: 250,
  },
} as const;

const saveBinaryToTempFile = async (
  content: string | Buffer,
  extension: string
) => {
  const projectDir = process.cwd();
  const filePath = path.join(projectDir, `temp-${uuidv4()}.${extension}`);

  try {
    setSentryServiceTag(serviceName);
    const data = content instanceof Buffer ? new Uint8Array(content) : content;
    await fs.promises.writeFile(filePath, data);
    await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    return {
      success: true,
      filePath,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error saving binary to temp file');
    return {
      success: false,
      message: `Failed to save file at ${filePath}: ${error}`,
    };
  }
};

export const convertAndStoreDocument = async ({
  fileContent,
  fileName,
  organizationId,
  fileId,
  projectId,
  mimeType,
}: ConvertAndStoreDocumentParams): Promise<ConvertAndStoreResult> => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(organizationId);
    setSentryContext('EXTRA_DATA', {
      fileName,
      fileId,
    });

    if (!fileContent) {
      return { success: false, message: 'File content missing!' };
    }

    let rawDocs: Document[] = [];
    const apiKey = await getOpenaiAPIKey(organizationId);

    if (!apiKey) {
      throw new Error('OpenAI API key is required.');
    }

    if (!mimeType) {
      return {
        success: false,
        message: 'Could not detect MIME type of the file.',
      };
    }

    logger.info({ mimeType }, 'Detected MIME type');

    const embeddingModel = await createEmbeddingsInstance({ apiKey });

    let fileExtension =
      SUPPORTED_MIME_TYPES[mimeType as keyof typeof SUPPORTED_MIME_TYPES];

    const extension = getFileExtension(fileName);
    if (extension === 'md' || extension === 'txt') {
      fileExtension = 'md';
    }

    if (!fileExtension) {
      return {
        success: false,
        message: `Unsupported file type: ${mimeType}`,
      };
    }
    const { filePath, message, success } = await saveBinaryToTempFile(
      fileContent,
      fileExtension
    );
    if (!success || !filePath) {
      return {
        success: false,
        message: `Failed to save temporary file: ${message}`,
      };
    }

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      let loader;
      switch (fileExtension) {
        case 'pdf':
          loader = new PDFOCRDocumentLoader({
            filePath,
            fileName,
            fileId,
            organizationId,
            projectId: projectId ?? undefined,
          });
          break;
        case 'srt':
          loader = new SRTLLMDocumentLoader({
            filePath,
            fileName,
            fileId,
            organizationId,
          });
          break;
        case 'epub':
          loader = new EPubLoader(filePath);
          break;
        case 'md':
          loader = new TextLoader(filePath);
          break;
        case 'url':
          const urlContent = fileContent.toString();

          // convention to fulfill ConvertAndStoreDocumentParams interface
          const [url, mode] = urlContent.split('-');
          if (
            mode !== WebsiteLoaderMode.CRAWL &&
            mode !== WebsiteLoaderMode.SCRAPE
          ) {
            throw new Error('Invalid crawl mode');
          }
          loader = new WebsiteDocumentLoader({
            url,
            mode,
            fileName,
            fileId,
            organizationId,
            projectId,
          });
          break;
        default:
          loader = undefined;
      }

      if (!loader) {
        throw new Error(
          `Unsupported file type, no loader found. File extension: ${fileExtension}, mimeType: ${mimeType}!`
        );
      }

      rawDocs = await loader.load();
    } catch (error) {
      logger.error(
        { err: error },
        `Error loading ${fileExtension.toUpperCase()} file`
      );
      return {
        success: false,
        message: `File is not accessible at: ${filePath}`,
        error: error as Error,
      };
    } finally {
      await fs.promises
        .rm(filePath, { recursive: true, force: true })
        .catch((error) => {
          logger.error({ err: error }, `Error removing file: ${filePath}`);
        });
    }

    const splitterSettings =
      CHUNK_SETTINGS[fileExtension as keyof typeof CHUNK_SETTINGS] ||
      CHUNK_SETTINGS.epub;

    const textSplitter =
      fileExtension === 'md'
        ? new MarkdownTextSplitter({
            chunkSize: splitterSettings.chunkSize,
            chunkOverlap: splitterSettings.chunkOverlap,
            keepSeparator: true,
          })
        : new RecursiveCharacterTextSplitter({
            chunkSize: splitterSettings.chunkSize,
            chunkOverlap: splitterSettings.chunkOverlap,
            keepSeparator: true,
          });

    const docs = await textSplitter.splitDocuments(rawDocs);

    const orgId = await getOrgIdFromAuthOrThrow();

    if (!orgId) {
      throw new Error('Invalid organization!');
    }

    const orgMetadata = await getOrganizationMetadata(orgId);
    const vectorStoreType = orgMetadata.privateMetadata?.vector_store;

    const updatedDocs = await Promise.all(
      docs.map(async (doc, index) => {
        const text = doc.pageContent;
        const metadata: VectorStoreDocumentMetadata = {
          file_name: fileName,
          page_number: index + 1,
          created_at: new Date().toISOString().split('T')[0],
          id: index,
          organization_id: organizationId,
          file_id: fileId,
          project_id: projectId,
          source_type: fileExtension,
          chunk_size: splitterSettings.chunkSize,
          chunk_overlap: splitterSettings.chunkOverlap,
          total_chunks: docs.length,
          word_count: text.split(/\s+/).length,
          previous_chunk_id: index > 0 ? index - 1 : -1,
          next_chunk_id: index < docs.length - 1 ? index + 1 : -1,
          status: 'active',
          embedding_model: embeddingModel.model,
        };

        if (vectorStoreType === 'qdrant') {
          return {
            pageContent: text,
            metadata,
            embedding: [],
          };
        } else {
          const [embedding] = await embeddingModel.embedDocuments([text]);
          return {
            pageContent: text,
            metadata,
            embedding,
          };
        }
      })
    );

    if (vectorStoreType === 'qdrant') {
      const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddingModel,
        {
          url: process.env.QDRANT_URL,
          apiKey: process.env.QDRANT_API_KEY, // staging and prod
          collectionName: orgId,
        }
      );

      await vectorStore.addDocuments(updatedDocs);
    } else {
      const vectorStore = new SupabaseVectorStore(embeddingModel, {
        client: supabaseVectorStoreClient,
        tableName: VECTOR_STORE_TABLE_NAME,
        queryName: DOCUMENT_SEARCH_QUERY_NAME,
      });

      await vectorStore.addVectors(
        updatedDocs.map((doc) => doc.embedding),
        updatedDocs.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        }))
      );
    }

    return {
      success: true,
      message: 'Document processed and stored successfully!',
    };
  } catch (error) {
    logger.error({ err: error }, 'Error processing document');
    return {
      success: false,
      message: `Error processing document: ${error}`,
    };
  }
};
