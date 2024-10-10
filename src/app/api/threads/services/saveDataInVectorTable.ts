import * as fs from 'node:fs';
import path from 'path';
import os from 'os';

import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
import { Document } from 'langchain/document';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { TokenTextSplitter } from '@langchain/textsplitters';

import {
  createTableIfNotExists,
  grantTablePermissions,
} from '@/libs/db/sqlRequest';
import { logger } from '@/app/lib/utils/logger';
import { supaBaseClient, embeddingModel } from './ChatService';

const saveBinaryToTempFile = async (content: string) => {
  const projectDir = process.cwd();
  const filePath = path.join(projectDir, `temp-${Date.now()}.epub`);

  try {
    await fs.promises.writeFile(filePath, content);
    const fileExists = await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    return filePath;
  } catch (error) {
    logger.error(`Failed to save file at ${filePath}: ${error}`);
    throw error;
  }
};

export const convertAndStoreDocument = async (
  fileContent: any,
  fileName: string,
  uploaderId: string
) => {
  try {
    if (!fileContent) {
      return { success: false, message: 'File content missing!' };
    }

    const tableName = `documents_${uploaderId}`;
    await createTableIfNotExists(tableName);
    await grantTablePermissions(tableName);

    let rawDocs;

    if (fileName.endsWith('.epub')) {
      const tempFilePath = await saveBinaryToTempFile(fileContent);
      try {
        await fs.promises.access(tempFilePath, fs.constants.R_OK);
      } catch (error) {
        if (error) {
          return {
            success: false,
            message: `File is not accessible at: ${tempFilePath}`,
            error,
          };
        }
      }

      const load = new EPubLoader(tempFilePath);

      rawDocs = await load.load();

      await fs.promises.unlink(tempFilePath);
    } else if (fileName.endsWith('.md')) {
      rawDocs = [new Document({ pageContent: fileContent })];
    } else {
      return { success: false, message: 'Unsupported file type!' };
    }
    const textSplitterEPub = new TokenTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });

    const textSplitter = new MarkdownTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      keepSeparator: true,
    });

    const docs = fileName.endsWith('.md')
      ? await textSplitter.splitDocuments(rawDocs)
      : await textSplitterEPub.splitDocuments(rawDocs);

    const updatedDocs = await Promise.all(
      docs.map(async (doc, index) => {
        const text = doc.pageContent;

        const metadata = {
          document_id: fileName,
          page_number: index + 1,
          created_at: new Date().toISOString().split('T')[0],
          tags: ['YouTube', 'Nagranie', 'Procedura'],
          id: index,
          language: 'pl',
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
      client: supaBaseClient,
      tableName,
      queryName: 'match_documents',
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
    return {
      success: false,
      message: `Error processing document: ${error}`,
    };
  }
};
