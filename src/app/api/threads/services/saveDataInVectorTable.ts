import * as fs from 'node:fs';
import path from 'path';

import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
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

const serviceName = 'saveDataInVectorTable';

type ConvertAndStoreResult = {
  success: boolean;
  message: string;
  error?: Error;
};

const saveBinaryToTempFile = async (content: string | Buffer) => {
  const projectDir = process.cwd();
  const filePath = path.join(projectDir, `temp-${Date.now()}.epub`);

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

export const convertAndStoreDocument = async (
  fileContent: string | Buffer,
  fileName: string,
  organizationId: string,
  fileId: string
): Promise<ConvertAndStoreResult> => {
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

    if (fileName.endsWith('.epub')) {
      const { filePath, message } = await saveBinaryToTempFile(fileContent);
      if (filePath) {
        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
          const load = new EPubLoader(filePath);
          rawDocs = await load.load();
        } catch (error) {
          logger.error({ err: error }, 'Error loading EPub file');
          return {
            success: false,
            message: `File is not accessible at: ${filePath}`,
            error: error as Error,
          };
        } finally {
          await fs.promises.unlink(filePath);
        }
      } else {
        return {
          success: false,
          message: `Failed to save temporary file: ${message}`,
        };
      }
    } else {
      const fileContentIsString = typeof fileContent === 'string';
      if (fileContentIsString) {
        rawDocs = [new Document({ pageContent: fileContent })];
      } else {
        return {
          success: false,
          message: 'Invalid file type detected.',
        };
      }
    }
    const textSplitterEPub = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 250,
      keepSeparator: true,
    });

    const textSplitter = new MarkdownTextSplitter({
      chunkSize: 800,
      chunkOverlap: 200,
      keepSeparator: true,
    });

    const docs = fileName.endsWith('.md')
      ? await textSplitter.splitDocuments(rawDocs)
      : await textSplitterEPub.splitDocuments(rawDocs);

    const updatedDocs = await Promise.all(
      docs.map(async (doc, index) => {
        const text = doc.pageContent;

        const metadata: VectorStoreDocumentMetadata = {
          file_name: fileName,
          page_number: index + 1,
          created_at: new Date().toISOString().split('T')[0],
          id: index,
          organization_id: organizationId.toLowerCase(),
          file_id: fileId,
        };

        const [embedding] = await embeddingModel.embedDocuments([text]);

        return {
          pageContent: text,
          metadata,
          embedding,
        };
      })
    );

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
