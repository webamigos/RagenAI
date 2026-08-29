/* eslint-disable @typescript-eslint/unbound-method */
const mockGenerateObject = jest.fn();
const mockGenerateText = jest.fn();
const mockRerankDocuments = jest.fn();
const mockIsRerankingEnabled = jest.fn();

jest.mock('ai', () => {
  const actual = jest.requireActual('ai');
  return {
    ...actual,
    generateObject: (...args: unknown[]) => mockGenerateObject(...args),
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  };
});

jest.mock('../../reranker/index.js', () => ({
  rerankDocuments: (...args: unknown[]) => mockRerankDocuments(...args),
  isRerankingEnabled: (...args: unknown[]) => mockIsRerankingEnabled(...args),
}));

import {
  expandQueries,
  rephraseAndExpand,
  rephraseQuestion,
  retrieveRelevantDocuments,
  MULTI_QUERY_VARIANT_COUNT,
} from './operations.js';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '../../vector-store/types.js';

// Minimal model stub — expandQueries only uses it as an opaque handle that
// gets passed to generateObject (which is mocked).
const fakeModel = { modelId: 'gemini-2.5-flash' } as LanguageModelV3;

function makeVectorStore(
  results: VectorStoreDocument[][],
): VectorStoreClient & {
  similaritySearch: jest.Mock;
} {
  const similaritySearch = jest.fn();
  results.forEach((r) => similaritySearch.mockResolvedValueOnce(r));
  return {
    similaritySearch,
    addDocuments: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('expandQueries', () => {
  it('returns LLM-generated variants on happy path', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        variants: ['how do I terminate my plan', 'canceling subscription'],
      },
    });

    // Explicit count=2 to test full happy path independently of the default
    const variants = await expandQueries(fakeModel, 'how do I cancel', 2);

    expect(variants).toEqual([
      'how do I terminate my plan',
      'canceling subscription',
    ]);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.system).toContain('query expansion');
    expect(callArgs.messages[0].content).toContain('how do I cancel');
    expect(callArgs.messages[0].content).toContain('2');
  });

  it('respects default MULTI_QUERY_VARIANT_COUNT of 1', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        variants: ['variant A', 'variant B'],
      },
    });

    const variants = await expandQueries(fakeModel, 'question');

    // Default count is 1, so only the first variant is returned
    expect(variants).toEqual(['variant A']);
    expect(MULTI_QUERY_VARIANT_COUNT).toBe(1);
  });

  it('trims whitespace and drops empty strings from variants', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        variants: ['  real variant  ', '', '   ', 'another one'],
      },
    });

    const variants = await expandQueries(fakeModel, 'question', 4);

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

  it('records AiUsage via the injected callback when tracking is provided', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { variants: ['v1'] },
      usage: { inputTokens: 40, outputTokens: 8 },
    });
    const trackAiUsage = jest.fn().mockResolvedValue(undefined);

    await expandQueries(
      fakeModel,
      'q',
      1,
      { organizationId: 'org-1', projectId: 'proj-1', userId: 'user-1' },
      trackAiUsage,
    );

    expect(trackAiUsage).toHaveBeenCalledTimes(1);
    expect(trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        projectId: 'proj-1',
        userId: 'user-1',
        step: 'REPHRASING',
        provider: 'litellm',
        model: 'gemini-2.5-flash',
        inputTokens: 40,
        outputTokens: 8,
        totalTokens: 48,
      }),
    );
  });

  it('skips tracking when no callback is provided', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { variants: ['v1'] },
      usage: { inputTokens: 40, outputTokens: 8 },
    });

    // No trackAiUsage passed at all — must not throw and must not track.
    await expect(
      expandQueries(fakeModel, 'q', 1, {
        organizationId: 'org-1',
      }),
    ).resolves.toEqual(['v1']);
  });

  it('skips tracking when no context is provided even with a callback', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { variants: ['v1'] },
      usage: { inputTokens: 40, outputTokens: 8 },
    });
    const trackAiUsage = jest.fn();

    await expandQueries(fakeModel, 'q', 1, undefined, trackAiUsage);

    expect(trackAiUsage).not.toHaveBeenCalled();
  });
});

describe('rephraseQuestion', () => {
  const makeInput = (question: string, chatHistory?: string) => ({
    question,
    chat_history: chatHistory ?? '',
  });

  it('records AiUsage via the injected callback when tracking is provided', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'rephrased',
      usage: { inputTokens: 25, outputTokens: 5 },
    });
    const trackAiUsage = jest.fn().mockResolvedValue(undefined);

    await rephraseQuestion(
      fakeModel,
      makeInput('cancel'),
      { organizationId: 'org-1', projectId: 'proj-1', userId: 'user-1' },
      trackAiUsage,
    );

    expect(trackAiUsage).toHaveBeenCalledTimes(1);
    expect(trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        projectId: 'proj-1',
        userId: 'user-1',
        step: 'REPHRASING',
        provider: 'litellm',
        model: 'gemini-2.5-flash',
        inputTokens: 25,
        outputTokens: 5,
        totalTokens: 30,
      }),
    );
  });

  it('skips tracking when no callback is provided', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'rephrased',
      usage: { inputTokens: 25, outputTokens: 5 },
    });

    await expect(
      rephraseQuestion(fakeModel, makeInput('cancel')),
    ).resolves.toBe('rephrased');
  });
});

describe('rephraseAndExpand', () => {
  const makeInput = (question: string, chatHistory?: string) => ({
    question,
    chat_history: chatHistory ?? '',
  });

  it('records AiUsage via the injected callback when tracking is provided', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { standaloneQuestion: 'rephrased', variants: [] },
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    const trackAiUsage = jest.fn().mockResolvedValue(undefined);

    await rephraseAndExpand(
      fakeModel,
      makeInput('hi'),
      true,
      undefined,
      { organizationId: 'org-1', projectId: 'proj-1', userId: 'user-1' },
      trackAiUsage,
    );

    expect(trackAiUsage).toHaveBeenCalledTimes(1);
    expect(trackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        projectId: 'proj-1',
        userId: 'user-1',
        step: 'REPHRASING',
        provider: 'litellm',
        model: 'gemini-2.5-flash',
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      }),
    );
  });

  it('skips tracking when no callback is provided', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { standaloneQuestion: 'rephrased', variants: [] },
      usage: { inputTokens: 50, outputTokens: 10 },
    });

    await expect(
      rephraseAndExpand(fakeModel, makeInput('hi')),
    ).resolves.toEqual({ standaloneQuestion: 'rephrased', variants: [] });
  });

  it('returns standalone question and variants in a single call', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: 'How do I cancel my subscription?',
        variants: ['terminate my plan'],
      },
    });

    const result = await rephraseAndExpand(fakeModel, makeInput('cancel'));

    expect(result.standaloneQuestion).toBe('How do I cancel my subscription?');
    expect(result.variants).toEqual(['terminate my plan']);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it('returns empty variants when expandVariants is false', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: 'How do I cancel?',
        variants: ['should be ignored'],
      },
    });

    const result = await rephraseAndExpand(
      fakeModel,
      makeInput('cancel'),
      false,
    );

    expect(result.standaloneQuestion).toBe('How do I cancel?');
    expect(result.variants).toEqual([]);
  });

  it('deduplicates variants against standalone question (case-insensitive)', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: 'How do I cancel?',
        variants: ['How Do I Cancel?', 'terminate subscription'],
      },
    });

    const result = await rephraseAndExpand(fakeModel, makeInput('cancel'));

    expect(result.variants).toEqual(['terminate subscription']);
  });

  it('caps variants at variantCount', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: 'question',
        variants: ['a', 'b', 'c', 'd', 'e'],
      },
    });

    const result = await rephraseAndExpand(fakeModel, makeInput('q'), true, 2);

    expect(result.variants).toHaveLength(2);
    expect(result.variants).toEqual(['a', 'b']);
  });

  it('falls back to raw input question on LLM error', async () => {
    mockGenerateObject.mockRejectedValue(new Error('timeout'));

    const result = await rephraseAndExpand(fakeModel, makeInput('my question'));

    expect(result.standaloneQuestion).toBe('my question');
    expect(result.variants).toEqual([]);
  });

  it('falls back to raw input when standalone question is empty', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: '   ',
        variants: ['variant'],
      },
    });

    const result = await rephraseAndExpand(
      fakeModel,
      makeInput('original question'),
    );

    expect(result.standaloneQuestion).toBe('original question');
    expect(result.variants).toEqual([]);
  });

  it('throws when called with no model', async () => {
    await expect(
      rephraseAndExpand(null as unknown as LanguageModelV3, makeInput('q')),
    ).rejects.toThrow(/No model instance/);
  });

  it('trims whitespace and drops empty variants', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: 'clean question',
        variants: ['  good  ', '', '   ', 'also good'],
      },
    });

    const result = await rephraseAndExpand(fakeModel, makeInput('q'), true, 5);

    expect(result.variants).toEqual(['good', 'also good']);
  });

  it('deduplicates variants against each other', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: 'question',
        variants: ['Alpha', 'ALPHA', 'alpha', 'Beta'],
      },
    });

    const result = await rephraseAndExpand(fakeModel, makeInput('q'), true, 5);

    expect(result.variants).toEqual(['Alpha', 'Beta']);
  });

  it('passes chat history as conversation messages', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        standaloneQuestion: 'standalone',
        variants: [],
      },
    });

    await rephraseAndExpand(
      fakeModel,
      makeInput('follow up', 'USER: hello\nASSISTANT: hi there'),
    );

    const callArgs = mockGenerateObject.mock.calls[0][0];
    // Chat history messages + the user's current question
    expect(callArgs.messages).toHaveLength(3);
    expect(callArgs.messages[0]).toEqual({
      role: 'user',
      content: 'hello',
    });
    expect(callArgs.messages[1]).toEqual({
      role: 'assistant',
      content: 'hi there',
    });
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
    mockRerankDocuments.mockImplementation((_q, docs, opts) =>
      docs.slice(0, opts?.topN),
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
      expect.objectContaining({ topN: 4 }),
    );
    // Deduped pool size: 5 + 2 = 7 unique (all different contents)
    const rerankInput = mockRerankDocuments.mock.calls[0][1];
    expect(rerankInput).toHaveLength(7);
  });

  it('forwards the tracking context and trackAiUsage callback to rerankDocuments', async () => {
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
    ]);
    const tracking = {
      organizationId: 'org_42',
      userId: 'user_7',
      projectId: 'proj_3',
    };
    const trackAiUsage = jest.fn();

    await retrieveRelevantDocuments(
      vs,
      ['q1'],
      4,
      undefined,
      undefined,
      true,
      tracking,
      trackAiUsage,
    );

    expect(mockRerankDocuments).toHaveBeenCalledWith(
      'q1',
      expect.any(Array),
      expect.objectContaining({ tracking, trackAiUsage }),
    );
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

  it('skips reranking when rerankingEnabled param is false even if infra supports it', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    const vs = makeVectorStore([
      [
        { pageContent: 'doc A', metadata: {} },
        { pageContent: 'doc B', metadata: {} },
        { pageContent: 'doc C', metadata: {} },
        { pageContent: 'doc D', metadata: {} },
        { pageContent: 'doc E', metadata: {} },
      ],
    ]);

    await retrieveRelevantDocuments(vs, ['q1'], 3, undefined, undefined, false);

    expect(mockRerankDocuments).not.toHaveBeenCalled();
    // Without reranking, per-query count = maxDocuments (no multiplier)
    expect(vs.similaritySearch).toHaveBeenCalledWith('q1', 3, undefined);
  });

  it('reranks when both rerankingEnabled param and infra check are true', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    mockRerankDocuments.mockImplementation((_q, docs, opts) =>
      docs.slice(0, opts?.topN),
    );
    const vs = makeVectorStore([
      [
        { pageContent: 'doc A', metadata: {} },
        { pageContent: 'doc B', metadata: {} },
        { pageContent: 'doc C', metadata: {} },
        { pageContent: 'doc D', metadata: {} },
        { pageContent: 'doc E', metadata: {} },
      ],
    ]);

    await retrieveRelevantDocuments(vs, ['q1'], 3, undefined, undefined, true);

    expect(mockRerankDocuments).toHaveBeenCalled();
  });
});
