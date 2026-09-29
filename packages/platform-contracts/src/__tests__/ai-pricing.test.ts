import { describe, expect, it } from 'vitest';

import {
  AI_PRICING,
  EUR_TO_USD,
  calculateCost,
  priceFor,
} from '../pricing/ai-pricing';

describe('calculateCost', () => {
  it('prices input and output per 1M tokens', () => {
    // 1M input @ $2 + 500k output @ $8
    expect(calculateCost('litellm', 'gpt-5.4', 1_000_000, 500_000)).toBe(6);
  });

  it('converts the EUR-priced Scaleway models to USD', () => {
    expect(
      calculateCost('litellm', 'mistral-small-3.2', 1_000_000, 0),
    ).toBeCloseTo(0.15 * EUR_TO_USD, 4);
  });

  it('is 0 for a model the table does not price', () => {
    expect(calculateCost('litellm', 'no-such-model', 1_000_000, 1)).toBe(0);
    expect(priceFor('no-such-provider', 'gpt-5.4')).toBeUndefined();
  });
});

describe('AI_PRICING', () => {
  // Priced for historical rows although no route serves them any more;
  // deleting one would zero the cost of past usage without an error.
  it.each([
    'gpt-5.3-chat',
    'claude-opus-4-6',
    'cohere-embed-multilingual-v3',
    'cohere-rerank-v3-5',
  ])('keeps the historical model %s', (model) => {
    expect(AI_PRICING.litellm?.[model]).toBeDefined();
  });

  it("prices the worker's default models", () => {
    // SUMMARY_MODEL and EMBEDDINGS_MODEL defaults, written as provider
    // 'litellm' by every worker usage row.
    expect(priceFor('litellm', 'gemini-2.5-flash')).toBeDefined();
    expect(priceFor('litellm', 'bge-multilingual-gemma2')).toBeDefined();
  });
});
