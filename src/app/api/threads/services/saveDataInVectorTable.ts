import * as fs from 'node:fs';
import path from 'path';

import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
import { Document } from 'langchain/document';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import {
  createTableIfNotExists,
  grantTablePermissions,
} from '@/libs/db/sqlRequest';
import {
  supaBaseClient,
  embeddingModel,
  generateLanguageSpecificTags,
} from './ChatService';

type ConvertAndStoreResult = {
  success: boolean;
  message: string;
  error?: Error;
};

const saveBinaryToTempFile = async (content: string | Buffer) => {
  const projectDir = process.cwd();
  const filePath = path.join(projectDir, `temp-${Date.now()}.epub`);

  try {
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
  uploaderId: string
): Promise<ConvertAndStoreResult> => {
  try {
    if (!fileContent) {
      return { success: false, message: 'File content missing!' };
    }

    const tableName = `documents_${uploaderId}`;
    await createTableIfNotExists(tableName);
    await grantTablePermissions(tableName);

    let rawDocs: Document[] = [];

    if (fileName.endsWith('.epub')) {
      const { filePath, message } = await saveBinaryToTempFile(fileContent);
      if (filePath) {
        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
          const load = new EPubLoader(filePath);
          rawDocs = await load.load();
        } catch (error) {
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
    }
    const textSplitterEPub = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      keepSeparator: true,
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

        const tags = await generateLanguageSpecificTags(text);

        const metadata = {
          document_id: fileName,
          page_number: index + 1,
          created_at: new Date().toISOString().split('T')[0],
          tags,
          id: index,
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
