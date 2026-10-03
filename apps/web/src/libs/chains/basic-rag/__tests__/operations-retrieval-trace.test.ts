import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Attributes, Span } from '@opentelemetry/api';

const { mockRerankDocuments, mockIsRerankingEnabled } = vi.hoisted(() => ({
  mockRerankDocuments: vi.fn(),
  mockIsRerankingEnabled: vi.fn(),
}));

vi.mock('@/libs/monitoring/with-span', () => ({
  withSpan: async <T>(
    _name: string,
    _attributes: Attributes,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> => fn({ setAttribute: () => undefined } as unknown as Span),
}));

vi.mock('@/libs/reranker', () => ({
  rerankDocuments: mockRerankDocuments,
  isRerankingEnabled: mockIsRerankingEnabled,
  rerankProviderName: () => 'scaleway',
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock(
  '@/features/ai-usage/services/commands/create-ai-usage-command',
  () => ({ trackAiUsage: vi.fn() }),
);

import { retrieveRelevantDocumentsWithIds } from '../operations';
import type { VectorStoreClient } from '@/libs/vector-store/types';

type Chunk = { pageContent: string; metadata: Record<string, unknown> };

/** One query, returning exactly the chunks the case is about. */
function storeReturning(chunks: Chunk[]): VectorStoreClient {
  return {
    similaritySearch: vi.fn(async () => chunks),
  } as unknown as VectorStoreClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsRerankingEnabled.mockReturnValue(false);
});

const chunk = (fileId: string, chunkIndex: number, text: string): Chunk => ({
  pageContent: text,
  metadata: {
    file_id: fileId,
    file_name: `${fileId}.pdf`,
    chunk_index: chunkIndex,
  },
});

/**
 * What reached the answer model, by position — the input of rag-benchmark's
 * evidence recall (spec 2026-09-29-llm-document-selection, Phase A).
 */
describe('retrieveRelevantDocumentsWithIds — the retrieval trace', () => {
  it('lists the rendered chunks, in the order the context renders them', async () => {
    const { context, trace } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        chunk('f-2', 7, 'Second file, seventh chunk.'),
        chunk('f-1', 3, 'First file, third chunk.'),
        chunk('f-2', 2, 'Second file, second chunk.'),
      ]),
      'q',
      5,
      undefined,
      false,
    );

    expect(trace?.chunks).toEqual([
      { fileId: 'f-2', chunkIndex: 7 },
      { fileId: 'f-1', chunkIndex: 3 },
      { fileId: 'f-2', chunkIndex: 2 },
    ]);
    const order = [
      'Second file, seventh chunk.',
      'First file, third chunk.',
      'Second file, second chunk.',
    ].map((text) => context.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('leaves out a chunk with no position rather than inventing one', async () => {
    const { trace, chunkCount } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        chunk('f-1', 1, 'Has a position.'),
        {
          pageContent: 'A point from before chunk_index.',
          metadata: { file_id: 'f-1' },
        },
      ]),
      'q',
      5,
      undefined,
      false,
    );
    expect(chunkCount).toBe(2);
    expect(trace?.chunks).toEqual([{ fileId: 'f-1', chunkIndex: 1 }]);
  });

  it('names fusion when nothing reranked, and counts the queries', async () => {
    const { trace } = await retrieveRelevantDocumentsWithIds(
      storeReturning([chunk('f-1', 1, 'Only chunk.')]),
      ['q', 'variant'],
      5,
      undefined,
      true,
    );
    expect(trace?.postRetrieval).toBe('fusion');
    expect(trace?.queryCount).toBe(2);
    expect(trace?.timings.rerankMs).toBe(0);
  });

  it('names the reranker when it cut the pool', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    mockRerankDocuments.mockImplementation(async (_q, docs: Chunk[]) =>
      docs.slice(0, 1).map((d) => ({
        ...d,
        metadata: { ...d.metadata, relevance_score: 0.9 },
      })),
    );
    const { trace } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        chunk('f-1', 1, 'One.'),
        chunk('f-1', 2, 'Two.'),
        chunk('f-2', 1, 'Three.'),
      ]),
      'q',
      1,
      undefined,
      true,
    );
    expect(trace?.postRetrieval).toBe('reranker:scaleway');
    expect(trace?.chunks).toEqual([{ fileId: 'f-1', chunkIndex: 1 }]);
  });

  // A provider failure returns the unscored pool: the model saw fusion order,
  // and the trace must not credit it to the reranker.
  it('names a reranker fallback as such', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    mockRerankDocuments.mockImplementation(async (_q, docs: Chunk[]) =>
      docs.slice(0, 1),
    );
    const { trace } = await retrieveRelevantDocumentsWithIds(
      storeReturning([chunk('f-1', 1, 'One.'), chunk('f-2', 1, 'Two.')]),
      'q',
      1,
      undefined,
      true,
    );
    expect(trace?.postRetrieval).toBe('reranker-failed:scaleway');
  });
});

/**
 * `contextExpansion` (spec 2026-09-29-llm-document-selection, B3): kept prose
 * hits are rendered with their ±1 neighbours, fetched through
 * `getChunksByIndex` inside the search's own filter.
 */
describe('retrieveRelevantDocumentsWithIds — context expansion', () => {
  const filter = {
    must: [{ key: 'metadata.organization_id', match: { value: 'org-1' } }],
  };

  function expandingStore(hits: Chunk[]) {
    const getChunksByIndex = vi.fn(
      async (_orgId: string, fileId: string, indexes: readonly number[]) =>
        indexes.map((i) => chunk(fileId, i, `${fileId} neighbour ${i}.`)),
    );
    const store = {
      similaritySearch: vi.fn(async () => hits),
      getChunksByIndex,
    } as unknown as VectorStoreClient;
    return { store, getChunksByIndex };
  }

  it('renders each hit with its neighbours and reports every position', async () => {
    const { store, getChunksByIndex } = expandingStore([
      chunk('f-1', 5, 'The hit.'),
    ]);
    const { context, trace, chunkCount } =
      await retrieveRelevantDocumentsWithIds(
        store,
        'q',
        4,
        filter,
        false,
        undefined,
        { orgId: 'org-1' },
      );

    expect(getChunksByIndex).toHaveBeenCalledWith(
      'org-1',
      'f-1',
      [4, 6],
      filter,
    );
    expect(context).toContain('f-1 neighbour 4.\nThe hit.\nf-1 neighbour 6.');
    expect(chunkCount).toBe(1);
    expect(trace?.expansion).toBe('neighbours');
    expect(trace?.chunks).toEqual([
      { fileId: 'f-1', chunkIndex: 4 },
      { fileId: 'f-1', chunkIndex: 5 },
      { fileId: 'f-1', chunkIndex: 6 },
    ]);
  });

  it('does nothing when the key is off, which is the default', async () => {
    const { store, getChunksByIndex } = expandingStore([
      chunk('f-1', 5, 'The hit.'),
    ]);
    const { trace } = await retrieveRelevantDocumentsWithIds(
      store,
      'q',
      4,
      filter,
      false,
    );

    expect(getChunksByIndex).not.toHaveBeenCalled();
    expect(trace?.expansion).toBe('off');
    expect(trace?.timings.expandMs).toBe(0);
  });

  it('renders the hit alone when the lookup fails, and still answers', async () => {
    const { store, getChunksByIndex } = expandingStore([
      chunk('f-1', 5, 'The hit.'),
    ]);
    getChunksByIndex.mockRejectedValue(new Error('qdrant down'));

    const { context, trace } = await retrieveRelevantDocumentsWithIds(
      store,
      'q',
      4,
      filter,
      false,
      undefined,
      { orgId: 'org-1' },
    );

    expect(context).toContain('The hit.');
    expect(context).not.toContain('neighbour');
    expect(trace?.expansion).toBe('off');
    expect(trace?.chunks).toEqual([{ fileId: 'f-1', chunkIndex: 5 }]);
  });
});

/**
 * `sectionSelection` (spec 2026-09-29-llm-document-selection, D1): a model
 * picks the passages from the widened pool, in the reranker's slot.
 */
describe('retrieveRelevantDocumentsWithIds — section selection', () => {
  const pool = [1, 2, 3, 4, 5, 6].map((n) =>
    chunk(`f-${n}`, 1, `Passage ${n}.`),
  );

  it('keeps what the model chose, in its order, and the reranker does not run', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    const generate = vi.fn().mockResolvedValue('5, 2');
    const { context, trace } = await retrieveRelevantDocumentsWithIds(
      storeReturning(pool),
      'q',
      2,
      undefined,
      true,
      undefined,
      undefined,
      { generate },
    );

    expect(mockRerankDocuments).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(trace?.postRetrieval).toBe('selection');
    expect(trace?.chunks.map((c) => c.fileId)).toEqual(['f-5', 'f-2']);
    expect(context.indexOf('Passage 5.')).toBeLessThan(
      context.indexOf('Passage 2.'),
    );
  });

  it('widens the pool the way the reranker does', async () => {
    const store = storeReturning(pool);
    await retrieveRelevantDocumentsWithIds(
      store,
      'q',
      2,
      undefined,
      false,
      undefined,
      undefined,
      { generate: vi.fn().mockResolvedValue('1') },
    );
    expect(store.similaritySearch).toHaveBeenCalledWith('q', 6, undefined);
  });

  it('names a fallback, and answers from fusion order', async () => {
    const { trace } = await retrieveRelevantDocumentsWithIds(
      storeReturning(pool),
      'q',
      2,
      undefined,
      false,
      undefined,
      undefined,
      { generate: vi.fn().mockRejectedValue(new Error('provider down')) },
    );
    expect(trace?.postRetrieval).toBe('selection-failed:error');
    expect(trace?.chunks.map((c) => c.fileId)).toEqual(['f-1', 'f-2']);
  });
});

/**
 * `expansion: 'off'` and `postRetrieval: 'fusion'` each cover two cases — the
 * stage was off, or it was on and changed nothing. The `*Enabled` flags tell
 * them apart without changing either value.
 */
describe('retrieveRelevantDocumentsWithIds — which stages were switched on', () => {
  const pool = [1, 2, 3].map((n) => chunk(`f-${n}`, 1, `Passage ${n}.`));

  function storeWithNeighbours(hits: Chunk[], neighbours: boolean) {
    return {
      similaritySearch: vi.fn(async () => hits),
      getChunksByIndex: vi.fn(
        async (_orgId: string, fileId: string, indexes: readonly number[]) =>
          neighbours
            ? indexes.map((i) => chunk(fileId, i, `${fileId} neighbour ${i}.`))
            : [],
      ),
    } as unknown as VectorStoreClient;
  }

  describe('expansion', () => {
    it('on and widened: neighbours, enabled', async () => {
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeWithNeighbours([chunk('f-1', 5, 'The hit.')], true),
        'q',
        4,
        undefined,
        false,
        undefined,
        { orgId: 'org-1' },
      );
      expect(trace?.expansion).toBe('neighbours');
      expect(trace?.expansionEnabled).toBe(true);
    });

    it('on but nothing to add: still off, but enabled', async () => {
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeWithNeighbours([chunk('f-1', 5, 'The hit.')], false),
        'q',
        4,
        undefined,
        false,
        undefined,
        { orgId: 'org-1' },
      );
      expect(trace?.expansion).toBe('off');
      expect(trace?.expansionEnabled).toBe(true);
    });

    it('switched off: off, not enabled', async () => {
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeWithNeighbours([chunk('f-1', 5, 'The hit.')], true),
        'q',
        4,
        undefined,
        false,
      );
      expect(trace?.expansion).toBe('off');
      expect(trace?.expansionEnabled).toBe(false);
    });

    it('a store that cannot fetch neighbours does not count as on', async () => {
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning([chunk('f-1', 5, 'The hit.')]),
        'q',
        4,
        undefined,
        false,
        undefined,
        { orgId: 'org-1' },
      );
      expect(trace?.expansion).toBe('off');
      expect(trace?.expansionEnabled).toBe(false);
    });
  });

  describe('reranking', () => {
    it('on and cut the pool: the reranker, enabled', async () => {
      mockIsRerankingEnabled.mockReturnValue(true);
      mockRerankDocuments.mockImplementation(async (_q, docs: Chunk[]) =>
        docs.slice(0, 1).map((d) => ({
          ...d,
          metadata: { ...d.metadata, relevance_score: 0.9 },
        })),
      );
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning(pool),
        'q',
        1,
        undefined,
        true,
      );
      expect(trace?.postRetrieval).toBe('reranker:scaleway');
      expect(trace?.rerankEnabled).toBe(true);
      expect(trace?.selectionEnabled).toBe(false);
    });

    it('on but nothing to cut: still fusion, but enabled', async () => {
      mockIsRerankingEnabled.mockReturnValue(true);
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning(pool),
        'q',
        5,
        undefined,
        true,
      );
      expect(mockRerankDocuments).not.toHaveBeenCalled();
      expect(trace?.postRetrieval).toBe('fusion');
      expect(trace?.rerankEnabled).toBe(true);
    });

    it('switched off by the org: fusion, not enabled', async () => {
      mockIsRerankingEnabled.mockReturnValue(true);
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning(pool),
        'q',
        1,
        undefined,
        false,
      );
      expect(trace?.postRetrieval).toBe('fusion');
      expect(trace?.rerankEnabled).toBe(false);
    });

    it('switched off by the feature flag: fusion, not enabled', async () => {
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning(pool),
        'q',
        1,
        undefined,
        true,
      );
      expect(trace?.postRetrieval).toBe('fusion');
      expect(trace?.rerankEnabled).toBe(false);
    });
  });

  describe('section selection', () => {
    it('on and cut the pool: selection, enabled, and the reranker is not', async () => {
      mockIsRerankingEnabled.mockReturnValue(true);
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning(pool),
        'q',
        1,
        undefined,
        true,
        undefined,
        undefined,
        { generate: vi.fn().mockResolvedValue('2') },
      );
      expect(trace?.postRetrieval).toBe('selection');
      expect(trace?.selectionEnabled).toBe(true);
      expect(trace?.rerankEnabled).toBe(false);
    });

    it('on but nothing to cut: still fusion, but enabled', async () => {
      const generate = vi.fn();
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning(pool),
        'q',
        5,
        undefined,
        false,
        undefined,
        undefined,
        { generate },
      );
      expect(generate).not.toHaveBeenCalled();
      expect(trace?.postRetrieval).toBe('fusion');
      expect(trace?.selectionEnabled).toBe(true);
    });

    it('switched off: fusion, not enabled', async () => {
      const { trace } = await retrieveRelevantDocumentsWithIds(
        storeReturning(pool),
        'q',
        1,
        undefined,
        false,
      );
      expect(trace?.postRetrieval).toBe('fusion');
      expect(trace?.selectionEnabled).toBe(false);
    });
  });
});
