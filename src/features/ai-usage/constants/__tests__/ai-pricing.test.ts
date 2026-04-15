import { describe, expect, it, vi } from 'vitest';
import { calculateCost } from '../ai-pricing';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('calculateCost', () => {
  describe('litellm provider', () => {
    it('prices gpt-5.4 per 1M tokens', () => {
      // 1M input @ $2 + 500k output @ $8 = $2 + $4 = $6
      expect(calculateCost('litellm', 'gpt-5.4', 1_000_000, 500_000)).toBe(6);
    });

    it('prices gemini-3-flash-preview', () => {
      // 1M @ $0.5 + 1M @ $3.0 = $3.5
      expect(
        calculateCost(
          'litellm',
          'gemini-3-flash-preview',
          1_000_000,
          1_000_000,
        ),
      ).toBe(3.5);
    });

    it('prices cohere embeddings (input-only)', () => {
      expect(
        calculateCost('litellm', 'cohere-embed-multilingual-v3', 1_000_000, 0),
      ).toBe(0.1);
    });

    it('returns 0 for cohere rerank (per-search billing not modeled)', () => {
      expect(calculateCost('litellm', 'cohere-rerank-v3-5', 1_000, 0)).toBe(0);
    });

    it('prorates fractional token counts', () => {
      // 100 input tokens @ $2/1M = $0.0002
      expect(calculateCost('litellm', 'gpt-5.4', 100, 0)).toBeCloseTo(0.0002);
    });
  });

  describe('unknown models', () => {
    it('returns 0 for unknown provider', () => {
      expect(calculateCost('unknown-provider', 'gpt-5.4', 1000, 0)).toBe(0);
    });

    it('returns 0 for unknown model within known provider', () => {
      expect(calculateCost('litellm', 'made-up-model', 1000, 0)).toBe(0);
    });
  });
});
