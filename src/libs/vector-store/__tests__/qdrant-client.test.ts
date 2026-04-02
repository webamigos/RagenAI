import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockQuery,
  mockUpsert,
  mockDelete,
  mockSetPayload,
  mockScroll,
  mockCollectionExists,
  mockCreateCollection,
  mockCreatePayloadIndex,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
  mockSetPayload: vi.fn(),
  mockScroll: vi.fn(),
  mockCollectionExists: vi.fn(),
  mockCreateCollection: vi.fn(),
  mockCreatePayloadIndex: vi.fn(),
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
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

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { QdrantVectorStoreClient } from '../qdrant-client';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';

function createMockEmbeddings(): EmbeddingsProvider {
  return {
    model: 'test-model',
    embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
    embedDocuments: vi
      .fn()
      .mockResolvedValue([
        new Array(1024).fill(0.1),
        new Array(1024).fill(0.2),
      ]),
  };
}

describe('QdrantVectorStoreClient', () => {
  let client: QdrantVectorStoreClient;
  let embeddings: EmbeddingsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    embeddings = createMockEmbeddings();
    mockCollectionExists.mockResolvedValue({ exists: true });

    client = new QdrantVectorStoreClient(embeddings, {
      url: 'http://localhost:6333',
      collectionName: 'test-collection',
    });
  });

  describe('similaritySearch', () => {
    it('should search with query embedding and return documents', async () => {
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

      const results = await client.similaritySearch('test query', 5);

      expect(embeddings.embedQuery).toHaveBeenCalledWith('test query');
      expect(mockQuery).toHaveBeenCalledWith('test-collection', {
        query: expect.any(Array),
        limit: 5,
        filter: undefined,
        with_payload: true,
      });
      expect(results).toHaveLength(2);
      expect(results[0].pageContent).toBe('Document content');
      expect(results[0].metadata).toEqual({
        file_id: 'f1',
        organization_id: 'org1',
      });
      expect(results[1].pageContent).toBe('Another document');
    });

    it('should convert intermediate filter to Qdrant format', async () => {
      mockQuery.mockResolvedValue({ points: [] });

      const filter = {
        must: [
          { key: 'metadata.organization_id', match: { value: 'org1' } },
          {
            key: 'metadata.accessible_by',
            match_any: { values: ['user:u1', 'team:t1'] },
          },
        ],
        should: [{ key: 'metadata.project_id', match: { value: 42 } }],
      };

      await client.similaritySearch('query', 10, filter);

      expect(mockQuery).toHaveBeenCalledWith('test-collection', {
        query: expect.any(Array),
        limit: 10,
        filter: {
          must: [
            { key: 'metadata.organization_id', match: { value: 'org1' } },
            {
              key: 'metadata.accessible_by',
              match: { any: ['user:u1', 'team:t1'] },
            },
          ],
          should: [{ key: 'metadata.project_id', match: { value: 42 } }],
        },
        with_payload: true,
      });
    });

    it('should convert is_null filter condition', async () => {
      mockQuery.mockResolvedValue({ points: [] });

      const filter = {
        must: [{ key: 'metadata.project_id', is_null: true }],
      };

      await client.similaritySearch('query', 5, filter);

      expect(mockQuery).toHaveBeenCalledWith('test-collection', {
        query: expect.any(Array),
        limit: 5,
        filter: {
          must: [{ is_null: { key: 'metadata.project_id' } }],
        },
        with_payload: true,
      });
    });
  });

  describe('addDocuments', () => {
    it('should embed documents and upsert to Qdrant', async () => {
      mockUpsert.mockResolvedValue({});

      const docs = [
        { pageContent: 'Doc 1', metadata: { file_id: 'f1' } },
        { pageContent: 'Doc 2', metadata: { file_id: 'f2' } },
      ];

      await client.addDocuments(docs);

      expect(embeddings.embedDocuments).toHaveBeenCalledWith([
        'Doc 1',
        'Doc 2',
      ]);
      expect(mockUpsert).toHaveBeenCalledWith('test-collection', {
        points: expect.arrayContaining([
          expect.objectContaining({
            vector: expect.any(Array),
            payload: {
              content: 'Doc 1',
              pageContent: 'Doc 1',
              metadata: { file_id: 'f1' },
            },
          }),
        ]),
        wait: true,
      });
    });

    it('should skip empty document arrays', async () => {
      await client.addDocuments([]);

      expect(embeddings.embedDocuments).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('deleteDocuments', () => {
    it('should delete documents matching filter', async () => {
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

    it('should skip delete with empty filter', async () => {
      await client.deleteDocuments({});

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('updatePayload', () => {
    it('should set payload on matching documents', async () => {
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
    it('should scroll through points with pagination', async () => {
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
    it('should create collection if it does not exist', async () => {
      mockCollectionExists.mockResolvedValue({ exists: false });
      mockCreateCollection.mockResolvedValue({});
      mockCreatePayloadIndex.mockResolvedValue({});
      mockQuery.mockResolvedValue({ points: [] });

      // Create a fresh client to reset the verified state
      const freshClient = new QdrantVectorStoreClient(embeddings, {
        url: 'http://localhost:6333',
        collectionName: 'new-collection',
      });

      await freshClient.similaritySearch('test', 1);

      expect(mockCollectionExists).toHaveBeenCalledWith('new-collection');
      expect(mockCreateCollection).toHaveBeenCalledWith('new-collection', {
        vectors: {
          size: 1024,
          distance: 'Cosine',
        },
        optimizers_config: {
          indexing_threshold: 20000,
        },
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(5);
    });

    it('should not create collection if it already exists', async () => {
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
