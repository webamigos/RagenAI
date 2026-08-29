/* eslint-disable @typescript-eslint/unbound-method */
import { ThreadDocumentRetriever } from './thread-document-retriever.js';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '../../vector-store/types.js';
import type { EmbeddingsProvider } from '../../llm/types/embeddings.js';
import type { ThreadDocumentUI } from '../types/thread-document.js';

function makeVectorStore(
  results: VectorStoreDocument[] = [],
): jest.Mocked<VectorStoreClient> {
  return {
    similaritySearch: jest.fn().mockResolvedValue(results),
    addDocuments: jest.fn(),
  };
}

function makeEmbeddings(): jest.Mocked<EmbeddingsProvider> {
  return {
    model: 'fake-model',
    embedDocuments: jest.fn(),
    embedQuery: jest.fn(),
  };
}

function makeDoc(overrides: Partial<ThreadDocumentUI> = {}): ThreadDocumentUI {
  return {
    name: 'doc.txt',
    content: 'some content',
    size: 100,
    type: 'text/plain',
    ...overrides,
  };
}

describe('ThreadDocumentRetriever', () => {
  it('returns an empty array when given no thread documents', async () => {
    const retriever = new ThreadDocumentRetriever(
      makeVectorStore(),
      makeEmbeddings(),
    );

    const result = await retriever.retrieveRelevantChunks([], 'query');

    expect(result).toEqual([]);
  });

  it('uses vectorstore results filtered by matching file_id', async () => {
    const vectorStore = makeVectorStore([
      { pageContent: 'match', metadata: { file_id: 'file-1' } },
      { pageContent: 'other file', metadata: { file_id: 'file-2' } },
    ]);
    const retriever = new ThreadDocumentRetriever(
      vectorStore,
      makeEmbeddings(),
    );
    const docs = [makeDoc({ userFileId: 'file-1' })];

    const result = await retriever.retrieveRelevantChunks(docs, 'query', 3);

    expect(vectorStore.similaritySearch).toHaveBeenCalledWith(
      'query',
      6,
      expect.any(Object),
    );
    expect(result).toEqual([
      { pageContent: 'match', metadata: { file_id: 'file-1' } },
    ]);
  });

  it('falls back to inline content search when vectorstore has no results', async () => {
    const vectorStore = makeVectorStore([]);
    const embeddings = makeEmbeddings();
    embeddings.embedQuery.mockResolvedValue([1, 0]);
    embeddings.embedDocuments.mockResolvedValue([[1, 0]]);
    const retriever = new ThreadDocumentRetriever(vectorStore, embeddings);
    const docs = [makeDoc({ name: 'inline.txt', content: 'inline content' })];

    const result = await retriever.retrieveRelevantChunks(docs, 'query', 3);

    expect(embeddings.embedQuery).toHaveBeenCalledWith('query');
    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe('inline content');
    expect(result[0].metadata?.source_type).toBe('thread_document_inline');
  });

  it('falls back to inline content when vectorstore search throws', async () => {
    const vectorStore = makeVectorStore();
    vectorStore.similaritySearch.mockRejectedValue(new Error('boom'));
    const embeddings = makeEmbeddings();
    embeddings.embedQuery.mockResolvedValue([1, 0]);
    embeddings.embedDocuments.mockResolvedValue([[1, 0]]);
    const retriever = new ThreadDocumentRetriever(vectorStore, embeddings);
    const docs = [makeDoc({ userFileId: 'file-1' })];

    const result = await retriever.retrieveRelevantChunks(docs, 'query', 3);

    expect(result).toHaveLength(1);
  });

  it('ranks inline results by cosine similarity, best first', async () => {
    const vectorStore = makeVectorStore([]);
    const embeddings = makeEmbeddings();
    embeddings.embedQuery.mockResolvedValue([1, 0]);
    embeddings.embedDocuments.mockResolvedValue([
      [0, 1], // orthogonal — low similarity
      [1, 0], // identical — high similarity
    ]);
    const retriever = new ThreadDocumentRetriever(vectorStore, embeddings);
    const docs = [
      makeDoc({ name: 'low.txt', content: 'low' }),
      makeDoc({ name: 'high.txt', content: 'high' }),
    ];

    const result = await retriever.retrieveRelevantChunks(docs, 'query', 2);

    expect(result[0].metadata?.fileName).toBe('high.txt');
    expect(result[1].metadata?.fileName).toBe('low.txt');
  });

  it('getThreadDocumentsStats summarizes thread documents', () => {
    const retriever = new ThreadDocumentRetriever(
      makeVectorStore(),
      makeEmbeddings(),
    );
    const docs = [
      makeDoc({ name: 'a.txt', size: 10, userFileId: 'f1' }),
      makeDoc({ name: 'b.txt', size: 20 }),
    ];

    const stats = retriever.getThreadDocumentsStats(docs);

    expect(stats).toEqual({
      totalFiles: 2,
      fileNames: ['a.txt', 'b.txt'],
      totalSizeBytes: 30,
      userFileIds: ['f1'],
    });
  });
});
