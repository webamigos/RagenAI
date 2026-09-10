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

  it('never cuts a snippet through the middle of a character', async () => {
    // `slice` counts UTF-16 code units and an emoji is two of them. Cutting
    // between the pair leaves an unpaired high surrogate: no longer valid
    // UTF-16, survives a JSON round-trip as U+FFFD, and renders as a
    // replacement glyph inside the quote.
    const store = makeVectorStore();
    // 1999 ASCII then an emoji: the 2000th unit is the emoji's first half.
    const text = 'a'.repeat(1999) + '\u{1F600}' + 'tail';
    store.similaritySearch = vi
      .fn()
      .mockResolvedValue([
        { pageContent: text, metadata: { file_id: 'f1', file_name: 'x.pdf' } },
      ]);

    const result = await retrieveRelevantDocumentsWithIds(store, ['q'], 4);
    const snippet = result.sources[0].snippet ?? '';

    expect(snippet).toHaveLength(1999);
    expect(snippet).toBe('a'.repeat(1999));
    // No lone surrogate anywhere in the result.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(snippet)).toBe(false);
    expect(snippet).toEqual(snippet.normalize('NFC'));
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

  it('carries the page of the chunk it took the snippet from', async () => {
    const store = makeVectorStore();
    store.similaritySearch = vi.fn().mockResolvedValue([
      {
        pageContent: 'on page seven',
        metadata: { file_id: 'f1', file_name: 'x.pdf', source_page: 7 },
      },
    ]);

    const result = await retrieveRelevantDocumentsWithIds(store, ['q'], 4);

    // The page, the score and the quote all describe the same chunk — the
    // best-ranked one for that file — so they can be shown on one row.
    expect(result.sources[0]).toMatchObject({
      fileId: 'f1',
      sourcePage: 7,
      snippet: 'on page seven',
    });
  });

  it('omits the page rather than inventing one when the parser knew none', async () => {
    // Absence is the discriminator. Defaulting to 1 would label every
    // document ingested before Docling reported pages, by a rule it predates.
    const result = await retrieveRelevantDocumentsWithIds(
      makeVectorStore(),
      ['q1'],
      4,
    );

    expect(result.sources[0]).not.toHaveProperty('sourcePage');
  });

  it('refuses a page that is not one', async () => {
    // These values are read back out of Qdrant, where they were written by
    // whatever version of the worker was running at ingest.
    const store = makeVectorStore();
    store.similaritySearch = vi.fn().mockResolvedValue([
      {
        pageContent: 'a',
        metadata: { file_id: 'f1', source_page: 0 },
      },
      {
        pageContent: 'b',
        metadata: { file_id: 'f2', source_page: 2.5 },
      },
      {
        pageContent: 'c',
        metadata: { file_id: 'f3', source_page: '4' },
      },
    ]);

    const result = await retrieveRelevantDocumentsWithIds(store, ['q'], 4);

    for (const source of result.sources) {
      expect(source).not.toHaveProperty('sourcePage');
    }
  });

  it('does not read the older page_number, which held the chunk index', async () => {
    // `page_number` is inert metadata still sitting on chunks ingested before
    // the rename. It counted chunks, so a twelve-page PDF split into forty
    // reported "page 37".
    const store = makeVectorStore();
    store.similaritySearch = vi.fn().mockResolvedValue([
      {
        pageContent: 'a',
        metadata: { file_id: 'f1', page_number: 37 },
      },
    ]);

    const result = await retrieveRelevantDocumentsWithIds(store, ['q'], 4);

    expect(result.sources[0]).not.toHaveProperty('sourcePage');
  });
});
