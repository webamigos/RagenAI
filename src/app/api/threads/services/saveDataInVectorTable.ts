import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { Document } from 'langchain/document';
import { MarkdownTextSplitter } from 'langchain/text_splitter';

import {
  createTableIfNotExists,
  grantTablePermissions,
} from '@/libs/db/sqlRequest';
import { supaBaseClient, embeddingModel } from './ChatService';
import {
  DOCUMENT_SEARCH_QUERY_NAME,
  VECTOR_STORE_TABLE_NAME,
} from '@/app/constants/vectorStore';

export const convertAndStoreDocument = async (
  fileContent: string,
  fileName: string,
  uploaderId: string
) => {
  if (!fileContent) {
    throw new Error('File content missing!');
  }

  const tableName = VECTOR_STORE_TABLE_NAME;

  await createTableIfNotExists(tableName);
  await grantTablePermissions(tableName);

  const rawDocs = [new Document({ pageContent: fileContent })];

  const textSplitter = new MarkdownTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
    keepSeparator: true,
  });

  const docs = await textSplitter.splitDocuments(rawDocs);

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
    queryName: DOCUMENT_SEARCH_QUERY_NAME,
  });

  await vectorStore.addVectors(
    updatedDocs.map((doc) => doc.embedding),
    updatedDocs.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata,
    }))
  );
};
