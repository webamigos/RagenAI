import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateObject, mockRerankDocuments, mockIsRerankingEnabled } =
  vi.hoisted(() => ({
    mockGenerateObject: vi.fn(),
    mockRerankDocuments: vi.fn(),
    mockIsRerankingEnabled: vi.fn(),
  }));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateObject: mockGenerateObject,
  };
});

vi.mock('@/libs/reranker', () => ({
  rerankDocuments: mockRerankDocuments,
  isRerankingEnabled: mockIsRerankingEnabled,
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
  expandQueries,
  retrieveRelevantDocuments,
  MULTI_QUERY_VARIANT_COUNT,
} from '../operations';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '@/libs/vector-store/types';

// Minimal model stub — expandQueries only uses it as an opaque handle that
// gets passed to generateObject (which is mocked).
const fakeModel = {} as LanguageModelV3;

function makeVectorStore(
  results: VectorStoreDocument[][],
): VectorStoreClient & {
  similaritySearch: ReturnType<typeof vi.fn>;
} {
  const similaritySearch = vi.fn();
  results.forEach((r) => similaritySearch.mockResolvedValueOnce(r));
  return {
    similaritySearch,
    addDocuments: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('expandQueries', () => {
  it('returns LLM-generated variants on happy path', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        variants: ['how do I terminate my plan', 'canceling subscription'],
      },
    });

    const variants = await expandQueries(fakeModel, 'how do I cancel');

    expect(variants).toEqual([
      'how do I terminate my plan',
      'canceling subscription',
    ]);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.system).toContain('query expansion');
    expect(callArgs.messages[0].content).toContain('how do I cancel');
    expect(callArgs.messages[0].content).toContain(
      String(MULTI_QUERY_VARIANT_COUNT),
    );
  });

  it('trims whitespace and drops empty strings from variants', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        variants: ['  real variant  ', '', '   ', 'another one'],
      },
    });

    const variants = await expandQueries(fakeModel, 'question');

    expect(variants).toEqual(['real variant', 'another one']);
  });

  it('returns empty array on LLM error (graceful fallback)', async () => {
    mockGenerateObject.mockRejectedValue(new Error('network timeout'));

    const variants = await expandQueries(fakeModel, 'question');

    expect(variants).toEqual([]);
  });

  it('returns empty array when LLM returns all-empty variants', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { variants: ['', '   ', '\n'] },
    });

    const variants = await expandQueries(fakeModel, 'question');

    expect(variants).toEqual([]);
  });

  it('throws when called with no model', async () => {
    await expect(
      expandQueries(null as unknown as LanguageModelV3, 'q'),
    ).rejects.toThrow(/No model instance/);
  });

  it('respects custom variant count in the prompt', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { variants: ['a', 'b', 'c', 'd', 'e'] },
    });

    const result = await expandQueries(fakeModel, 'question', 5);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('5');
    // All 5 unique variants pass through the cap
    expect(result).toHaveLength(5);
  });

  it('caps the number of returned variants at variantCount', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { variants: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    });

    const result = await expandQueries(fakeModel, 'question', 3);

    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('deduplicates variants that collide after normalization', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        variants: ['How do I cancel', 'HOW DO I CANCEL', 'how do i cancel'],
      },
    });

    const result = await expandQueries(fakeModel, 'different question', 3);

    expect(result).toEqual(['How do I cancel']);
  });

  it('drops variants that collide with the original standalone question', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        variants: [
          'how do I cancel',
          'How Do I Cancel',
          'canceling subscription',
        ],
      },
    });

    const result = await expandQueries(fakeModel, 'how do I cancel', 3);

    // Both of the first two match the standalone question (case-insensitive)
    // and should be dropped; only the genuinely-different variant survives.
    expect(result).toEqual(['canceling subscription']);
  });
});

describe('retrieveRelevantDocuments (multi-query)', () => {
  it('throws when vector store is missing', async () => {
    mockIsRerankingEnabled.mockReturnValue(false);
    await expect(
      retrieveRelevantDocuments(null as unknown as VectorStoreClient, [
        'query',
      ]),
    ).rejects.toThrow(/No vector store/);
  });

  it('accepts a single string query (backwards-compatible call shape)', async () => {
    mockIsRerankingEnabled.mockReturnValue(false);
    const vs = makeVectorStore([
      [
        { pageContent: 'doc A', metadata: {} },
        { pageContent: 'doc B', metadata: {} },
      ],
    ]);

    await retrieveRelevantDocuments(vs, 'single query', 4);

    expect(vs.similaritySearch).toHaveBeenCalledTimes(1);
    expect(vs.similaritySearch).toHaveBeenCalledWith(
      'single query',
      4,
      undefined,
    );
  });

  it('fans out one vector search per query and dedupes by content', async () => {
    mockIsRerankingEnabled.mockReturnValue(false);
    const vs = makeVectorStore([
      [
        { pageContent: 'doc A', metadata: { src: 'q1' } },
        { pageContent: 'doc B', metadata: { src: 'q1' } },
      ],
      [
        { pageContent: 'doc B', metadata: { src: 'q2' } }, // duplicate of q1
        { pageContent: 'doc C', metadata: { src: 'q2' } },
      ],
      [
        { pageContent: 'doc A', metadata: { src: 'q3' } }, // duplicate of q1
        { pageContent: 'doc D', metadata: { src: 'q3' } },
      ],
    ]);

    const result = await retrieveRelevantDocuments(vs, ['q1', 'q2', 'q3'], 4);

    expect(vs.similaritySearch).toHaveBeenCalledTimes(3);
    // Deduped pool: A, B, C, D → 4 unique, returns all 4
    expect(result).toContain('doc A');
    expect(result).toContain('doc B');
    expect(result).toContain('doc C');
    expect(result).toContain('doc D');
  });

  it('splits per-query count when reranking is enabled', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    mockRerankDocuments.mockImplementation(async (_q, docs, k) =>
      docs.slice(0, k),
    );
    const vs = makeVectorStore([
      [{ pageContent: '1', metadata: {} }],
      [{ pageContent: '2', metadata: {} }],
      [{ pageContent: '3', metadata: {} }],
    ]);

    // maxDocuments=4, rerank multiplier=3 → pool target=12
    // Split across 3 queries → 4 per query (floor(12/3))
    await retrieveRelevantDocuments(vs, ['q1', 'q2', 'q3'], 4);

    expect(vs.similaritySearch).toHaveBeenNthCalledWith(1, 'q1', 4, undefined);
    expect(vs.similaritySearch).toHaveBeenNthCalledWith(2, 'q2', 4, undefined);
    expect(vs.similaritySearch).toHaveBeenNthCalledWith(3, 'q3', 4, undefined);
  });

  it('floors per-query count at maxDocuments', async () => {
    mockIsRerankingEnabled.mockReturnValue(false);
    // With rerank disabled, pool target = maxDocuments.
    // Split across 3 queries would give floor(4/3) = 1, but the floor is
    // maxDocuments itself → 4 per query.
    const vs = makeVectorStore([
      [{ pageContent: '1', metadata: {} }],
      [{ pageContent: '2', metadata: {} }],
      [{ pageContent: '3', metadata: {} }],
    ]);

    await retrieveRelevantDocuments(vs, ['q1', 'q2', 'q3'], 4);

    for (const call of vs.similaritySearch.mock.calls) {
      expect(call[1]).toBe(4);
    }
  });

  it('reranks using the first query (primary standalone)', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    mockRerankDocuments.mockResolvedValue([
      { pageContent: 'reranked-1', metadata: {} },
    ]);
    const vs = makeVectorStore([
      [
        { pageContent: 'doc A', metadata: {} },
        { pageContent: 'doc B', metadata: {} },
        { pageContent: 'doc C', metadata: {} },
        { pageContent: 'doc D', metadata: {} },
        { pageContent: 'doc E', metadata: {} },
      ],
      [
        { pageContent: 'doc F', metadata: {} },
        { pageContent: 'doc G', metadata: {} },
      ],
    ]);

    await retrieveRelevantDocuments(vs, ['primary question', 'variant'], 4);

    expect(mockRerankDocuments).toHaveBeenCalledWith(
      'primary question',
      expect.any(Array),
      4,
      undefined,
    );
    // Deduped pool size: 5 + 2 = 7 unique (all different contents)
    const rerankInput = mockRerankDocuments.mock.calls[0][1];
    expect(rerankInput).toHaveLength(7);
  });

  it('skips rerank when pool is smaller than maxDocuments', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    const vs = makeVectorStore([
      [
        { pageContent: 'doc A', metadata: {} },
        { pageContent: 'doc B', metadata: {} },
      ],
    ]);

    await retrieveRelevantDocuments(vs, ['q1'], 10);

    expect(mockRerankDocuments).not.toHaveBeenCalled();
  });

  it('passes the metadata filter to every similarity search', async () => {
    mockIsRerankingEnabled.mockReturnValue(false);
    const vs = makeVectorStore([
      [{ pageContent: '1', metadata: {} }],
      [{ pageContent: '2', metadata: {} }],
    ]);
    const filter = { must: [{ key: 'org', match: { value: 'org1' } }] };

    await retrieveRelevantDocuments(vs, ['q1', 'q2'], 4, filter);

    for (const call of vs.similaritySearch.mock.calls) {
      expect(call[2]).toEqual(filter);
    }
  });

  it('treats undefined/empty filter as no filter', async () => {
    mockIsRerankingEnabled.mockReturnValue(false);
    const vs = makeVectorStore([[{ pageContent: '1', metadata: {} }]]);

    await retrieveRelevantDocuments(vs, ['q1'], 4, {});

    expect(vs.similaritySearch).toHaveBeenCalledWith('q1', 4, undefined);
  });

  it('returns empty result string for empty query list', async () => {
    mockIsRerankingEnabled.mockReturnValue(false);
    const vs = makeVectorStore([]);

    const result = await retrieveRelevantDocuments(vs, [], 4);

    expect(vs.similaritySearch).not.toHaveBeenCalled();
    expect(result).toBe('');
  });
});
