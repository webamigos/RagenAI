import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { MarkdownTextSplitter } from 'langchain/text_splitter';
import { supeBaseClient, embeddingModel } from '../services/ChatService';

const loader = new TextLoader(
  'src/data/ProceduratworzeniacontentuYouTubeSolo.md'
);

export const convertAndStoreDocument = async () => {
  const rawDocs = await loader.load();

  if (!rawDocs || rawDocs.length === 0) {
    throw new Error('No documents were loaded');
  }

  const textSplitter = new MarkdownTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
    keepSeparator: true,
  });

  const docs = await textSplitter.splitDocuments(rawDocs);

  const updatedDocs = await Promise.all(
    docs.map(async (doc, index) => {
      const text = doc.pageContent;

      const sectionTitle = extractSectionTitle(text);

      const metadata = {
        document_id: 'ProceduratworzeniacontentuYouTubeSolo',
        section_title: sectionTitle,
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
    client: supeBaseClient,
    tableName: 'documents',
    queryName: 'match_documents',
  });

  await vectorStore.addVectors(
    updatedDocs.map((doc) => doc.embedding),
    updatedDocs.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata,
    }))
  );
};

function extractSectionTitle(text: string) {
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^#+\s+(.*)/);
    if (match) {
      return match[1].trim();
    }
  }
  return '';
}
