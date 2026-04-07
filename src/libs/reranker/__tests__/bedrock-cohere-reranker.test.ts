import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

function mockFetchResponse(
  results: Array<{ index: number; relevance_score: number }>,
) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('bedrock-cohere-reranker', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.LITELLM_PROXY_URL = 'http://localhost:4000';
    process.env.LITELLM_MASTER_KEY = 'sk-test';
    process.env.FEATURE_FLAG_RERANKING = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('isRerankingEnabled', () => {
    it('should return true when feature flag and LITELLM_PROXY_URL are set', () => {
      process.env.FEATURE_FLAG_RERANKING = '1';
      process.env.LITELLM_PROXY_URL = 'http://localhost:4000';
      expect(isRerankingEnabled()).toBe(true);
    });

    it('should return false when LITELLM_PROXY_URL is missing', () => {
      process.env.FEATURE_FLAG_RERANKING = '1';
      delete process.env.LITELLM_PROXY_URL;
      expect(isRerankingEnabled()).toBe(false);
    });

    it('should return false when feature flag is missing', () => {
      delete process.env.FEATURE_FLAG_RERANKING;
      process.env.LITELLM_PROXY_URL = 'http://localhost:4000';
      expect(isRerankingEnabled()).toBe(false);
    });

    it('should return false when feature flag is not "1"', () => {
      process.env.FEATURE_FLAG_RERANKING = '0';
      process.env.LITELLM_PROXY_URL = 'http://localhost:4000';
      expect(isRerankingEnabled()).toBe(false);
    });
  });

  describe('rerankDocuments', () => {
    it('should return empty array for empty input', async () => {
      const result = await rerankDocuments('query', []);
      expect(result).toEqual([]);
    });

    it('should skip reranking when docs count <= topN', async () => {
      const docs = makeDocs(3);
      const result = await rerankDocuments('query', docs, 5);
      expect(result).toEqual(docs);
    });

    it('should rerank documents and return sorted by relevance', async () => {
      const docs = makeDocs(6);

      mockFetchResponse([
        { index: 4, relevance_score: 0.95 },
        { index: 1, relevance_score: 0.82 },
        { index: 5, relevance_score: 0.71 },
      ]);

      const result = await rerankDocuments('test query', docs, 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(docs[4]);
      expect(result[1]).toBe(docs[1]);
      expect(result[2]).toBe(docs[5]);
    });

    it('should send correct payload to LiteLLM', async () => {
      const docs = makeDocs(4);
      mockFetchResponse([
        { index: 0, relevance_score: 0.9 },
        { index: 2, relevance_score: 0.7 },
      ]);

      await rerankDocuments('my query', docs, 2);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4000/rerank',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk-test',
          },
        }),
      );

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body).toEqual({
        model: 'cohere-rerank-v3-5',
        query: 'my query',
        documents: docs.map((d) => d.pageContent),
        top_n: 2,
      });
    });

    it('should gracefully fall back on fetch error', async () => {
      const docs = makeDocs(8);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Network error'),
      );

      const result = await rerankDocuments('query', docs, 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(docs[0]);
      expect(result[1]).toBe(docs[1]);
      expect(result[2]).toBe(docs[2]);
    });

    it('should gracefully fall back on non-OK response', async () => {
      const docs = makeDocs(6);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500 }),
      );

      const result = await rerankDocuments('query', docs, 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(docs[0]);
    });
  });
});
