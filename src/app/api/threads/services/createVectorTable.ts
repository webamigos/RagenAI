import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { MultiFileLoader } from 'langchain/document_loaders/fs/multi_file';
import { formatDocumentsAsString } from 'langchain/util/document';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Document } from '@langchain/core/documents';

import { logger } from '../../../lib/utils/logger';
import { supeBaseClient, embeddingModel } from '../services/ChatService';

const multiFileLoader = new MultiFileLoader(
  [
    'src/data/ProceduratworzeniacontentuYouTubeSolo.pdf',
    'src/data/PROCEDURAtworzeniapostaLinkedIn.pdf',
    'src/data/PROCEDURAWEBINAR(Checklistawebinarowa).pdf',
    'src/data/ProceduraStrategiaMarketingowaLeadMagnet.pdf',
  ],
  {
    '.pdf': (path: string) => new PDFLoader(path),
  }
);

// Function to add documents to store
const vectorStore = new SupabaseVectorStore(embeddingModel, {
  client: supeBaseClient,
  tableName: 'documents',
  queryName: 'match_documents',
});

export const addDocumentsToStore = async (chunks: string[]) => {
  try {
    ///////////////////
    const allPFFDocuments = await multiFileLoader.load();

    if (!allPFFDocuments || allPFFDocuments.length === 0) {
      throw new Error('No documents were loaded');
    }

    const stringDocs = formatDocumentsAsString(allPFFDocuments);

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', ' ', ''],
    });

    const output = await textSplitter.createDocuments([stringDocs]);
    ///////////////////

    const docs: Document[] = chunks.map((text, index) => ({
      pageContent: text,
      metadata: { id: index },
    }));

    const embeddingsArray = await embeddingModel.embedDocuments(chunks);

    const postgresDocuments = docs.map((doc, index) => ({
      content: doc.pageContent,
      metadata: JSON.stringify(doc.metadata),
      embedding: `[${embeddingsArray[index].join(', ')}]`,
    }));

    const { data, error } = await supeBaseClient
      .from('documents')
      .insert(
        postgresDocuments.map((doc) => ({
          content: doc.content,
          metadata: doc.metadata,
          embedding: doc.embedding,
        }))
      )
      .select('id');

    if (error) {
      logger.error('Error inserting documents into PostgreSQL:', error.message);
      throw new Error(
        `Error inserting documents into PostgreSQL: ${error.message}`
      );
    }

    const ids = data.map((row) => row.id);

    await vectorStore.addDocuments(output, { ids });
  } catch (error) {
    logger.error('Error adding documents to store: %o', error);
  }
};
