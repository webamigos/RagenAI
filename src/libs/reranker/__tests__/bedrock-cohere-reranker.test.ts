import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  InvokeModelCommand: vi.fn().mockImplementation((input) => input),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  rerankDocuments,
  isRerankingEnabled,
} from '../bedrock-cohere-reranker';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

function makeDocs(count: number): VectorStoreDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    pageContent: `Document ${i} content about topic ${i}`,
    metadata: { file_id: `f${i}`, chunk_index: i },
  }));
}

function mockBedrockResponse(
  results: Array<{ index: number; relevance_score: number }>,
) {
  const body = new TextEncoder().encode(JSON.stringify({ results }));
  mockSend.mockResolvedValue({ body });
}

describe('bedrock-cohere-reranker', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isRerankingEnabled', () => {
    it('should return true when AWS credentials are set', () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      expect(isRerankingEnabled()).toBe(true);
    });

    it('should return false when AWS credentials are missing', () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      expect(isRerankingEnabled()).toBe(false);
    });

    it('should return false when only access key is set', () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      delete process.env.AWS_SECRET_ACCESS_KEY;
      expect(isRerankingEnabled()).toBe(false);
    });
  });

  describe('rerankDocuments', () => {
    it('should return empty array for empty input', async () => {
      const result = await rerankDocuments('query', []);
      expect(result).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should skip reranking when docs count <= topN', async () => {
      const docs = makeDocs(3);
      const result = await rerankDocuments('query', docs, 5);
      expect(result).toEqual(docs);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should rerank documents and return sorted by relevance', async () => {
      const docs = makeDocs(6);

      // Bedrock returns top 3, with doc[4] most relevant, then doc[1], then doc[5]
      mockBedrockResponse([
        { index: 4, relevance_score: 0.95 },
        { index: 1, relevance_score: 0.82 },
        { index: 5, relevance_score: 0.71 },
      ]);

      const result = await rerankDocuments('test query', docs, 3);

      expect(mockSend).toHaveBeenCalledOnce();
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(docs[4]);
      expect(result[1]).toBe(docs[1]);
      expect(result[2]).toBe(docs[5]);
    });

    it('should send correct payload to Bedrock', async () => {
      const docs = makeDocs(4);
      mockBedrockResponse([
        { index: 0, relevance_score: 0.9 },
        { index: 2, relevance_score: 0.7 },
      ]);

      await rerankDocuments('my query', docs, 2);

      const call = mockSend.mock.calls[0][0];
      const body = JSON.parse(call.body);
      expect(body).toEqual({
        query: 'my query',
        documents: docs.map((d) => d.pageContent),
        top_n: 2,
        api_version: 2,
      });
    });

    it('should gracefully fall back on Bedrock error', async () => {
      const docs = makeDocs(8);
      mockSend.mockRejectedValue(new Error('Bedrock timeout'));

      const result = await rerankDocuments('query', docs, 3);

      // Should return first 3 docs as fallback
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(docs[0]);
      expect(result[1]).toBe(docs[1]);
      expect(result[2]).toBe(docs[2]);
    });
  });
});
