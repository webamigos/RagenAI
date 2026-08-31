import {
  rerankDocumentsScaleway,
  isScalewayRerankingEnabled,
} from './scaleway-reranker.js';
import type { VectorStoreDocument } from '../vector-store/types.js';

function makeDocs(count: number): VectorStoreDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    pageContent: `Document ${i} content about topic ${i}`,
    metadata: { file_id: `f${i}`, chunk_index: i },
  }));
}

function mockFetchResponse(
  results: Array<{ index: number; relevance_score: number }>,
) {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('scaleway-reranker', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SCW_API_BASE = 'https://api.scaleway.ai/proj/v1';
    process.env.SCW_API_KEY = 'scw-test-key';
    process.env.FEATURE_FLAG_RERANKING = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('isScalewayRerankingEnabled', () => {
    it('returns true when flag and both env vars are set', () => {
      expect(isScalewayRerankingEnabled()).toBe(true);
    });

    it('returns false when SCW_API_BASE is missing', () => {
      delete process.env.SCW_API_BASE;
      expect(isScalewayRerankingEnabled()).toBe(false);
    });

    it('returns false when SCW_API_KEY is missing', () => {
      delete process.env.SCW_API_KEY;
      expect(isScalewayRerankingEnabled()).toBe(false);
    });
  });

  describe('rerankDocumentsScaleway', () => {
    it('returns empty array for empty input', async () => {
      expect(await rerankDocumentsScaleway('q', [])).toEqual([]);
    });

    it('skips reranking when docs count <= topN', async () => {
      const docs = makeDocs(3);
      expect(await rerankDocumentsScaleway('q', docs, { topN: 5 })).toEqual(
        docs,
      );
    });

    it('throws when SCW_API_BASE is missing', async () => {
      delete process.env.SCW_API_BASE;
      await expect(
        rerankDocumentsScaleway('q', makeDocs(6), { topN: 3 }),
      ).rejects.toThrow('SCW_API_BASE is required');
    });

    it('throws when SCW_API_KEY is missing', async () => {
      delete process.env.SCW_API_KEY;
      await expect(
        rerankDocumentsScaleway('q', makeDocs(6), { topN: 3 }),
      ).rejects.toThrow('SCW_API_KEY is required');
    });

    it('drops out-of-range indices instead of crashing', async () => {
      const docs = makeDocs(4);
      mockFetchResponse([
        { index: 0, relevance_score: 0.9 },
        { index: 99, relevance_score: 0.8 }, // out of range — must be dropped
        { index: 2, relevance_score: 0.7 },
      ]);

      const result = await rerankDocumentsScaleway('q', docs, { topN: 3 });

      expect(result).toEqual([docs[0], docs[2]]);
    });

    it('gracefully falls back on fetch error', async () => {
      const docs = makeDocs(8);
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));

      const result = await rerankDocumentsScaleway('q', docs, { topN: 3 });

      expect(result).toEqual(docs.slice(0, 3));
    });
  });
});
