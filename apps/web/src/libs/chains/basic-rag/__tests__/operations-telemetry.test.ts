import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Attributes, Span } from '@opentelemetry/api';

const { mockRerankDocuments, mockIsRerankingEnabled, spanCalls } = vi.hoisted(
  () => ({
    mockRerankDocuments: vi.fn(),
    mockIsRerankingEnabled: vi.fn(),
    spanCalls: [] as { name: string; attributes: Record<string, unknown> }[],
  }),
);

// Pass-through stub: runs the real callback so the retrieval logic is
// exercised unchanged, while recording what each span was named and the
// attributes it ended up carrying.
vi.mock('@/libs/monitoring/with-span', () => ({
  withSpan: async <T>(
    name: string,
    attributes: Attributes,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> => {
    const recorded: { name: string; attributes: Record<string, unknown> } = {
      name,
      attributes: { ...attributes },
    };
    spanCalls.push(recorded);
    const span = {
      setAttribute: (key: string, value: unknown) => {
        recorded.attributes[key] = value;
        return span;
      },
    } as unknown as Span;
    return fn(span);
  },
}));

vi.mock('@/libs/reranker', () => ({
  rerankDocuments: mockRerankDocuments,
  isRerankingEnabled: mockIsRerankingEnabled,
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

function makeVectorStore(): VectorStoreClient {
  return {
    similaritySearch: vi.fn(async (query: string) => [
      // Same content for every query, so dedupe visibly collapses them.
      {
        pageContent: 'shared',
        metadata: { file_id: 'file-a', file_name: 'alpha.pdf' },
      },
      { pageContent: `unique-${query}`, metadata: { file_id: 'file-b' } },
    ]),
  } as unknown as VectorStoreClient;
}

function findSpan(name: string) {
  return spanCalls.find((c) => c.name === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  spanCalls.length = 0;
  mockIsRerankingEnabled.mockReturnValue(false);
});

describe('retrieveRelevantDocumentsWithIds telemetry', () => {
  it('opens a rag.retrieve span describing the retrieval shape', async () => {
    await retrieveRelevantDocumentsWithIds(makeVectorStore(), ['q1', 'q2'], 4);

    const span = findSpan('rag.retrieve');
    expect(span).toBeDefined();
    expect(span?.attributes).toMatchObject({
      'rag.query_count': 2,
      'rag.max_documents': 4,
      'rag.reranking_enabled': false,
    });
  });

  it('records how many documents survived dedupe', async () => {
    await retrieveRelevantDocumentsWithIds(makeVectorStore(), ['q1', 'q2'], 4);

    // 2 queries x 2 docs = 4 retrieved, but 'shared' collapses to one -> 3.
    expect(findSpan('rag.retrieve')?.attributes).toMatchObject({
      'rag.retrieved_count': 4,
      'rag.deduped_count': 3,
    });
  });

  it('records the final and file counts', async () => {
    await retrieveRelevantDocumentsWithIds(makeVectorStore(), ['q1'], 4);

    expect(findSpan('rag.retrieve')?.attributes).toMatchObject({
      'rag.final_count': 2,
      'rag.file_count': 2,
    });
  });

  it('adds a nested rag.rerank span only when reranking actually runs', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    mockRerankDocuments.mockResolvedValue([
      { pageContent: 'shared', metadata: { file_id: 'file-a' } },
    ]);

    await retrieveRelevantDocumentsWithIds(
      makeVectorStore(),
      ['q1', 'q2', 'q3'],
      1,
    );

    expect(findSpan('rag.rerank')?.attributes).toMatchObject({
      'rag.rerank_input_count': 4,
    });
  });

  it('skips the rerank span when the pool is too small to rerank', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);

    await retrieveRelevantDocumentsWithIds(makeVectorStore(), ['q1'], 10);

    expect(mockRerankDocuments).not.toHaveBeenCalled();
    expect(findSpan('rag.rerank')).toBeUndefined();
  });

  it('does not open a span when there are no queries to run', async () => {
    const result = await retrieveRelevantDocumentsWithIds(
      makeVectorStore(),
      [],
      4,
    );

    expect(result.fileIds).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(spanCalls).toHaveLength(0);
  });

  it('returns each retrieved file once, with the name the chunk was rendered under', async () => {
    // `sources` is what the model was shown. The citation decision happens
    // later, against the answer text — so a missing file_name has to survive
    // here as null rather than dropping the file from the list.
    const result = await retrieveRelevantDocumentsWithIds(
      makeVectorStore(),
      ['q1', 'q2'],
      4,
    );

    expect(result.sources).toEqual([
      { fileId: 'file-a', fileName: 'alpha.pdf', snippet: 'shared' },
      { fileId: 'file-b', fileName: null, snippet: 'unique-q1' },
    ]);
    expect(result.fileIds).toEqual(['file-a', 'file-b']);
  });

  it('carries the chunk text, so the answer can be quoted later', async () => {
    // Taken here because this is where it still exists: the reduction to
    // `RetrievedSource` drops `pageContent`, and Qdrant chunk ids do not
    // survive a re-index, so nothing can go back for it afterwards.
    const result = await retrieveRelevantDocumentsWithIds(
      makeVectorStore(),
      ['q1'],
      4,
    );

    expect(result.sources[0].snippet).toBe('shared');
  });
});
