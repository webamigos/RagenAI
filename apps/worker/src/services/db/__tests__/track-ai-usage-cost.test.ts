import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  aiUsage: { create: vi.fn() },
}));
vi.mock('../prisma.js', () => ({ getPrisma: () => prisma }));

import { EUR_TO_USD } from '@ragenai/platform-contracts';

import { db, estimateCost } from '../db.js';

beforeEach(() => {
  vi.clearAllMocks();
  prisma.aiUsage.create.mockResolvedValue({});
});

/**
 * Worker usage rows carried `estimatedCost: 0`, so the monthly cost ceiling —
 * which sums that column — never saw ingest. They are priced from the same
 * table apps/web and apps/api use.
 */
describe('trackAiUsage — the cost it stores', () => {
  it('prices a summary call on the default summary model', async () => {
    await db.trackAiUsage({
      organizationId: 'org-1',
      step: 'CHAT_COMPLETION',
      provider: 'litellm',
      model: 'gemini-2.5-flash',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
    });

    const { data } = prisma.aiUsage.create.mock.calls[0]![0] as {
      data: { estimatedCost: number; organizationId: string };
    };
    // $0.1 input + $0.4 output per 1M tokens.
    expect(data.estimatedCost).toBeCloseTo(0.5, 6);
    expect(data.organizationId).toBe('org-1');
  });

  it('prices embeddings on the default embedding model, converted from EUR', async () => {
    await db.trackAiUsage({
      organizationId: 'org-1',
      step: 'EMBEDDINGS',
      provider: 'litellm',
      model: 'bge-multilingual-gemma2',
      inputTokens: 2_000_000,
      outputTokens: 0,
      totalTokens: 2_000_000,
    });

    const { data } = prisma.aiUsage.create.mock.calls[0]![0] as {
      data: { estimatedCost: number };
    };
    expect(data.estimatedCost).toBeCloseTo(2 * 0.1 * EUR_TO_USD, 6);
  });

  it('stores 0 for a model the table does not price, and still writes the row', async () => {
    await db.trackAiUsage({
      organizationId: 'org-1',
      step: 'EMBEDDINGS',
      provider: 'litellm',
      model: 'a-model-nobody-priced',
      inputTokens: 1_000,
      outputTokens: 0,
      totalTokens: 1_000,
    });

    const { data } = prisma.aiUsage.create.mock.calls[0]![0] as {
      data: { estimatedCost: number; totalTokens: number };
    };
    expect(data.estimatedCost).toBe(0);
    expect(data.totalTokens).toBe(1_000);
  });
});

describe('estimateCost', () => {
  it('treats negative or missing token counts as zero', () => {
    expect(
      estimateCost({
        provider: 'litellm',
        model: 'gemini-2.5-flash',
        inputTokens: -5,
        outputTokens: Number.NaN,
      }),
    ).toBe(0);
  });
});
