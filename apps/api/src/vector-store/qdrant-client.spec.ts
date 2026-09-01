/* eslint-disable @typescript-eslint/unbound-method */
const mockQuery = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockSetPayload = jest.fn();
const mockScroll = jest.fn();
const mockCollectionExists = jest.fn();
const mockCreateCollection = jest.fn();
const mockCreatePayloadIndex = jest.fn();

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    upsert: mockUpsert,
    delete: mockDelete,
    setPayload: mockSetPayload,
    scroll: mockScroll,
    collectionExists: mockCollectionExists,
    createCollection: mockCreateCollection,
    createPayloadIndex: mockCreatePayloadIndex,
  })),
}));

import { QdrantVectorStoreClient } from './qdrant-client.js';
import type { EmbeddingsProvider } from '../llm/types/embeddings.js';

function createMockEmbeddings(): EmbeddingsProvider {
  return {
    model: 'test-model',
    embedQuery: jest.fn().mockResolvedValue(new Array(1024).fill(0.1)),
    embedDocuments: jest
      .fn()
      .mockResolvedValue([
        new Array(1024).fill(0.1),
        new Array(1024).fill(0.2),
      ]),
  };
}

describe('QdrantVectorStoreClient (hybrid search)', () => {
  let client: QdrantVectorStoreClient;
  let embeddings: EmbeddingsProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    embeddings = createMockEmbeddings();
    mockCollectionExists.mockResolvedValue({ exists: true });

    client = new QdrantVectorStoreClient(embeddings, {
      url: 'http://localhost:6333',
      collectionName: 'test-collection',
    });
  });

  describe('similaritySearch', () => {
    it('uses RRF fusion over dense + sparse prefetch branches', async () => {
      mockQuery.mockResolvedValue({
        points: [
          {
            id: 'abc-123',
            payload: {
              content: 'Document content',
              metadata: { file_id: 'f1', organization_id: 'org1' },
            },
          },
          {
            id: 'def-456',
            payload: {
              pageContent: 'Another document',
              metadata: { file_id: 'f2' },
            },
          },
        ],
      });

      const results = await client.similaritySearch('faktura vat', 5);

      expect(embeddings.embedQuery).toHaveBeenCalledWith('faktura vat');
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toBe('test-collection');

      const queryBody = callArgs[1];
      expect(queryBody.query).toEqual({ fusion: 'rrf' });
      expect(queryBody.limit).toBe(5);
      expect(queryBody.with_payload).toBe(true);

      // Two prefetch branches: dense + sparse
      expect(queryBody.prefetch).toHaveLength(2);
      const denseBranch = queryBody.prefetch.find(
        (p: { using: string }) => p.using === 'dense',
      );
      const sparseBranch = queryBody.prefetch.find(
        (p: { using: string }) => p.using === 'sparse',
      );
      expect(denseBranch).toBeDefined();
      expect(sparseBranch).toBeDefined();
      expect(denseBranch.query).toEqual(expect.any(Array));
      expect(sparseBranch.query).toHaveProperty('indices');
      expect(sparseBranch.query).toHaveProperty('values');
      // Over-fetch by 4x k per branch
      expect(denseBranch.limit).toBe(20);
      expect(sparseBranch.limit).toBe(20);

      expect(results).toHaveLength(2);
      expect(results[0].pageContent).toBe('Document content');
      expect(results[1].pageContent).toBe('Another document');
    });

    it('falls back to dense-only when query has no sparse tokens', async () => {
      mockQuery.mockResolvedValue({ points: [] });

      // Punctuation / digits only — no unicode letter tokens
      await client.similaritySearch('42!? ...', 5);

      const queryBody = mockQuery.mock.calls[0][1];
      expect(queryBody.prefetch).toHaveLength(1);
      expect(queryBody.prefetch[0].using).toBe('dense');
    });

    it('passes converted filter to every prefetch branch', async () => {
      mockQuery.mockResolvedValue({ points: [] });

      const filter = {
        must: [
          { key: 'metadata.organization_id', match: { value: 'org1' } },
          {
            key: 'metadata.accessible_by',
            match_any: { values: ['user:u1', 'team:t1'] },
          },
        ],
      };

      await client.similaritySearch('hello world', 10, filter);

      const queryBody = mockQuery.mock.calls[0][1];
      const expectedFilter = {
        must: [
          { key: 'metadata.organization_id', match: { value: 'org1' } },
          {
            key: 'metadata.accessible_by',
            match: { any: ['user:u1', 'team:t1'] },
          },
        ],
      };
      for (const branch of queryBody.prefetch) {
        expect(branch.filter).toEqual(expectedFilter);
      }
    });

    it('converts is_null filter condition', async () => {
      mockQuery.mockResolvedValue({ points: [] });

      const filter = {
        must: [{ key: 'metadata.project_id', is_null: true }],
      };

      await client.similaritySearch('hello', 5, filter);

      const queryBody = mockQuery.mock.calls[0][1];
      expect(queryBody.prefetch[0].filter).toEqual({
        must: [{ is_null: { key: 'metadata.project_id' } }],
      });
    });
  });

  describe('addDocuments', () => {
    it('upserts points with named dense + sparse vectors', async () => {
      mockUpsert.mockResolvedValue({});

      const docs = [
        { pageContent: 'faktura vat dla klienta', metadata: { file_id: 'f1' } },
        { pageContent: 'invoice amount total', metadata: { file_id: 'f2' } },
      ];

      await client.addDocuments(docs);

      expect(embeddings.embedDocuments).toHaveBeenCalledWith([
        'faktura vat dla klienta',
        'invoice amount total',
      ]);
      expect(mockUpsert).toHaveBeenCalledTimes(1);

      const upsertBody = mockUpsert.mock.calls[0][1];
      expect(upsertBody.points).toHaveLength(2);

      const point = upsertBody.points[0];
      expect(point.vector).toHaveProperty('dense');
      expect(point.vector).toHaveProperty('sparse');
      expect(point.vector.dense).toEqual(expect.any(Array));
      expect(point.vector.dense).toHaveLength(1024);
      expect(point.vector.sparse).toHaveProperty('indices');
      expect(point.vector.sparse).toHaveProperty('values');
      expect(point.vector.sparse.indices.length).toBeGreaterThan(0);
      expect(point.payload.metadata).toEqual({ file_id: 'f1' });
    });

    it('omits sparse vector for chunks with no tokenizable content', async () => {
      mockUpsert.mockResolvedValue({});

      await client.addDocuments([
        { pageContent: '42 !!', metadata: { file_id: 'f1' } },
        { pageContent: 'real content', metadata: { file_id: 'f2' } },
      ]);

      const upsertBody = mockUpsert.mock.calls[0][1];
      expect(upsertBody.points[0].vector).toEqual({
        dense: expect.any(Array),
      });
      expect(upsertBody.points[0].vector).not.toHaveProperty('sparse');
      expect(upsertBody.points[1].vector).toHaveProperty('sparse');
    });

    it('skips empty document arrays', async () => {
      await client.addDocuments([]);

      expect(embeddings.embedDocuments).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('deleteDocuments', () => {
    it('deletes documents matching filter', async () => {
      mockDelete.mockResolvedValue({});

      const filter = {
        must: [{ key: 'metadata.file_id', match: { value: 'f1' } }],
      };

      await client.deleteDocuments(filter);

      expect(mockDelete).toHaveBeenCalledWith('test-collection', {
        filter: {
          must: [{ key: 'metadata.file_id', match: { value: 'f1' } }],
        },
        wait: true,
      });
    });

    it('skips delete with empty filter', async () => {
      await client.deleteDocuments({});

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('updatePayload', () => {
    it('sets payload on matching documents', async () => {
      mockSetPayload.mockResolvedValue({});

      const filter = {
        must: [{ key: 'metadata.file_id', match: { value: 'f1' } }],
      };

      await client.updatePayload(filter, {
        'metadata.accessible_by': ['user:u1'],
      });

      expect(mockSetPayload).toHaveBeenCalledWith('test-collection', {
        payload: { 'metadata.accessible_by': ['user:u1'] },
        filter: {
          must: [{ key: 'metadata.file_id', match: { value: 'f1' } }],
        },
        wait: true,
      });
    });
  });

  describe('scrollPoints', () => {
    it('scrolls through points with pagination', async () => {
      mockScroll.mockResolvedValue({
        points: [
          {
            id: 'abc',
            payload: { metadata: { file_id: 'f1' } },
          },
        ],
        next_page_offset: 'next-id',
      });

      const result = await client.scrollPoints({}, 50);

      expect(mockScroll).toHaveBeenCalledWith('test-collection', {
        filter: undefined,
        limit: 50,
        offset: undefined,
        with_payload: true,
        with_vector: false,
      });
      expect(result.points).toHaveLength(1);
      expect(result.nextOffset).toBe('next-id');
    });
  });

  describe('ensureCollection', () => {
    it('creates collection with hybrid dense+sparse schema', async () => {
      mockCollectionExists.mockResolvedValue({ exists: false });
      mockCreateCollection.mockResolvedValue({});
      mockCreatePayloadIndex.mockResolvedValue({});
      mockQuery.mockResolvedValue({ points: [] });

      const freshClient = new QdrantVectorStoreClient(embeddings, {
        url: 'http://localhost:6333',
        collectionName: 'new-collection',
      });

      await freshClient.similaritySearch('test', 1);

      expect(mockCollectionExists).toHaveBeenCalledWith('new-collection');
      expect(mockCreateCollection).toHaveBeenCalledWith('new-collection', {
        vectors: {
          dense: {
            size: 3584,
            distance: 'Cosine',
          },
        },
        sparse_vectors: {
          sparse: {
            modifier: 'idf',
          },
        },
        optimizers_config: {
          indexing_threshold: 20000,
        },
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(4);
    });

    it('does not create collection if it already exists', async () => {
      mockCollectionExists.mockResolvedValue({ exists: true });
      mockQuery.mockResolvedValue({ points: [] });

      const freshClient = new QdrantVectorStoreClient(embeddings, {
        url: 'http://localhost:6333',
        collectionName: 'existing-collection',
      });

      await freshClient.similaritySearch('test', 1);

      expect(mockCreateCollection).not.toHaveBeenCalled();
    });
  });
});
