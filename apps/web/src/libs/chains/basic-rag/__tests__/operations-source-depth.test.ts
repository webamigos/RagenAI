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

/**
 * How much of each file the model was shown.
 *
 * The dedupe keeps one chunk per file and drops the rest, so every other field
 * on a source describes its *best* chunk. These two say how deeply the file
 * itself was read, which is the question the sources rail answers and the one
 * thing that was being computed and thrown away on every turn.
 */
describe('retrieveRelevantDocumentsWithIds — per-file depth', () => {
  it('counts every chunk a file contributed, not the one that survived dedupe', async () => {
    const { sources } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        {
          pageContent: 'a1',
          metadata: { file_id: 'file-a', file_name: 'a.pdf' },
        },
        {
          pageContent: 'a2',
          metadata: { file_id: 'file-a', file_name: 'a.pdf' },
        },
        {
          pageContent: 'a3',
          metadata: { file_id: 'file-a', file_name: 'a.pdf' },
        },
        {
          pageContent: 'b1',
          metadata: { file_id: 'file-b', file_name: 'b.pdf' },
        },
      ]),
      ['q'],
      10,
    );

    expect(sources.map((s) => [s.fileId, s.chunkCount])).toEqual([
      ['file-a', 3],
      ['file-b', 1],
    ]);
  });

  it('lists the distinct pages ascending, deduped', async () => {
    const { sources } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        {
          pageContent: 'a1',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 9 },
        },
        {
          pageContent: 'a2',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 2 },
        },
        {
          pageContent: 'a3',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 9 },
        },
      ]),
      ['q'],
      10,
    );

    expect(sources[0].pages).toEqual([2, 9]);
  });

  /**
   * The best chunk's page is not the first page in the list. The rail shows
   * where the file was read from; the sources block labels the one chunk it
   * quotes. Two different claims, and collapsing them would put the wrong
   * page under a quote.
   */
  it('keeps sourcePage as the best chunk, not the lowest page', async () => {
    const { sources } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        {
          pageContent: 'best',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 9 },
        },
        {
          pageContent: 'later',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 2 },
        },
      ]),
      ['q'],
      10,
    );

    expect(sources[0].sourcePage).toBe(9);
    expect(sources[0].pages).toEqual([2, 9]);
  });

  /**
   * Absence is the discriminator, exactly as it is for `sourcePage` and the
   * relevance score. An empty array would tell the reader the file came from
   * no pages, where the truth is that the parser could not say.
   */
  it('omits pages entirely when no chunk carried one', async () => {
    const { sources } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        {
          pageContent: 'a1',
          metadata: { file_id: 'file-a', file_name: 'a.pdf' },
        },
      ]),
      ['q'],
      10,
    );

    expect(sources[0]).not.toHaveProperty('pages');
  });

  it('ignores a page value that is not a page', async () => {
    const { sources } = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        {
          pageContent: 'a1',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 0 },
        },
        {
          pageContent: 'a2',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 1.5 },
        },
        {
          pageContent: 'a3',
          metadata: { file_id: 'file-a', file_name: 'a.pdf', source_page: 4 },
        },
      ]),
      ['q'],
      10,
    );

    expect(sources[0].pages).toEqual([4]);
  });

  /**
   * A chunk with no file id belongs to no source. It still counted toward the
   * turn's `chunkCount`, so the per-file counts sum to less than it — stated
   * here so the difference is a decision rather than a discrepancy someone
   * finds later.
   */
  it('counts an unattributable chunk against no file', async () => {
    const result = await retrieveRelevantDocumentsWithIds(
      storeReturning([
        {
          pageContent: 'a1',
          metadata: { file_id: 'file-a', file_name: 'a.pdf' },
        },
        { pageContent: 'orphan', metadata: {} },
      ]),
      ['q'],
      10,
    );

    expect(result.chunkCount).toBe(2);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].chunkCount).toBe(1);
  });
});
