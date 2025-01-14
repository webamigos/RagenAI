import * as fs from 'node:fs';
import path from 'path';

import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
import { UnstructuredLoader } from '@langchain/community/document_loaders/fs/unstructured';
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
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getOrganizationMetadata } from '@/app/actions';

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
  projectId: number | null;
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
    chunkOverlap: 250,
  },
} as const;

const saveBinaryToTempFile = async (
  content: string | Buffer,
  extension: string
) => {
  const projectDir = process.cwd();
  const filePath = path.join(projectDir, `tmp/${Date.now()}.${extension}`);

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
    if (error) {
      return {
        success: false,
        message: `Failed to save file at ${filePath}: ${error}`,
      };
    }
    throw error;
  }
};

export const convertAndStoreDocument = async ({
  fileContent,
  fileName,
  organizationId,
  fileId,
  projectId,
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

    const embeddingModel = await createEmbeddingsInstance({ apiKey });
    const fileExtension = path.extname(fileName).slice(1).toLowerCase();

    if (
      fileExtension === 'pdf' ||
      fileExtension === 'epub' ||
      fileExtension === 'csv'
    ) {
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

      if (filePath) {
        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
          const load = new UnstructuredLoader(filePath, {
            apiKey: process.env.UNSTRUCTURED_API_KEY,
            apiUrl: process.env.UNSTRUCTURED_API_URL,
          });
          rawDocs = await load.load();
        } catch (error) {
          logger.error({ err: error }, 'Error loading file');
          return {
            success: false,
            message: `File is not accessible at: ${filePath}`,
            error: error as Error,
          };
        } finally {
          await fs.promises.unlink(filePath);
        }
      }
    }

    // if (fileName.endsWith('.epub')) {
    //   const { filePath, message } = await saveBinaryToTempFile(fileContent);
    //   if (filePath) {
    //     try {
    //       await fs.promises.access(filePath, fs.constants.R_OK);
    //       const load = new EPubLoader(filePath);
    //       rawDocs = await load.load();
    //     } catch (error) {
    //       logger.error({ err: error }, 'Error loading EPub file');
    //       return {
    //         success: false,
    //         message: `File is not accessible at: ${filePath}`,
    //         error: error as Error,
    //       };
    //     } finally {
    //       await fs.promises.unlink(filePath);
    //     }
    //   } else {
    //     return {
    //       success: false,
    //       message: `Failed to save temporary file: ${message}`,
    //     };
    //   }
    // } else {
    //   const fileContentIsString = typeof fileContent === 'string';
    //   if (fileContentIsString) {
    //     rawDocs = [new Document({ pageContent: fileContent })];
    //   } else {
    //     return {
    //       success: false,
    //       message: 'Invalid file type detected.',
    //     };
    //   }
    // }
    const textSplitterEPub = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SETTINGS.epub.chunkSize,
      chunkOverlap: CHUNK_SETTINGS.epub.chunkOverlap,
      keepSeparator: true,
    });

    const textSplitter = new MarkdownTextSplitter({
      chunkSize: CHUNK_SETTINGS.markdown.chunkSize,
      chunkOverlap: CHUNK_SETTINGS.markdown.chunkOverlap,
      keepSeparator: true,
    });

    const docs = fileName.endsWith('.md')
      ? await textSplitter.splitDocuments(rawDocs)
      : await textSplitterEPub.splitDocuments(rawDocs);

    const { orgId } = auth();

    if (!orgId) {
      throw new Error('Invalid organization!');
    }

    const orgMetadata = await getOrganizationMetadata(orgId);
    const vectorStoreType = orgMetadata.privateMetadata?.vector_store;

    const updatedDocs = await Promise.all(
      docs.map(async (doc, index) => {
        const text = doc.pageContent;

        const fileExtension = path.extname(fileName)?.slice(1) || '';
        const isMarkdown = fileExtension === 'md';
        const chunkSettings = isMarkdown
          ? CHUNK_SETTINGS.markdown
          : CHUNK_SETTINGS.epub;

        const metadata: VectorStoreDocumentMetadata = {
          file_name: fileName,
          page_number: index + 1,
          created_at: new Date().toISOString().split('T')[0],
          id: index,
          organization_id: organizationId,
          file_id: fileId,
          project_id: projectId,
          source_type: fileExtension,
          chunk_size: chunkSettings.chunkSize,
          chunk_overlap: chunkSettings.chunkOverlap,
          total_chunks: docs.length,
          word_count: text.split(/\s+/).length,
          previous_chunk_id: index > 0 ? index - 1 : -1,
          next_chunk_id: index < docs.length - 1 ? index + 1 : -1,
          status: 'active',
          embedding_model: embeddingModel.modelName,
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
