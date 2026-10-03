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

const chunk = (fileId: string, text: string): Chunk => ({
  pageContent: text,
  metadata: { file_id: fileId, file_name: `${fileId}.pdf`, chunk_index: 1 },
});

/** Each query gets its own list, as Qdrant answers each one separately. */
function storeByQuery(lists: Record<string, Chunk[]>): VectorStoreClient {
  return {
    similaritySearch: vi.fn(async (query: string) => lists[query] ?? []),
  } as unknown as VectorStoreClient;
}

const lists = {
  standalone: ['a1', 'a2', 'a3', 'a4'].map((t) => chunk('f-a', t)),
  variant: ['b1', 'b2', 'b3', 'b4'].map((t) => chunk('f-b', t)),
};

const run = (crossQueryFusion?: boolean) =>
  retrieveRelevantDocumentsWithIds(
    storeByQuery(lists),
    ['standalone', 'variant'],
    4,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    crossQueryFusion,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockIsRerankingEnabled.mockReturnValue(false);
});

/**
 * `crossQueryFusion` (spec 2026-10-03-retrieval-claims, B0). With no
 * reranker or selection, the cut used to keep the first query's hits: the
 * variant's never reached the model.
 */
describe('retrieveRelevantDocumentsWithIds — cross-query fusion', () => {
  it('keeps only the first query’s hits when the key is off, which is today', async () => {
    const { context, fileIds, trace } = await run();
    expect(context).toContain('a4');
    expect(context).not.toContain('b1');
    expect(fileIds).toEqual(['f-a']);
    expect(trace?.crossQueryFusionEnabled).toBe(false);
  });

  it('lets the variant’s best hits in when the key is on', async () => {
    const { context, fileIds, trace } = await run(true);
    for (const text of ['a1', 'b1', 'a2', 'b2']) {
      expect(context).toContain(text);
    }
    expect(context).not.toContain('a4');
    expect(fileIds).toEqual(['f-a', 'f-b']);
    expect(trace?.crossQueryFusionEnabled).toBe(true);
    expect(trace?.postRetrieval).toBe('fusion');
  });

  it('leaves the reranker to choose from the whole pool when it runs', async () => {
    mockIsRerankingEnabled.mockReturnValue(true);
    mockRerankDocuments.mockImplementation(async (_q: string, docs: Chunk[]) =>
      docs.slice(-4),
    );

    const { context } = await retrieveRelevantDocumentsWithIds(
      storeByQuery(lists),
      ['standalone', 'variant'],
      4,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      true,
    );

    // The reranker saw the concatenated pool and picked its tail; fusion did
    // not reorder anything under it.
    expect(
      mockRerankDocuments.mock.calls[0][1].map((d: Chunk) => d.pageContent),
    ).toEqual(['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']);
    expect(context).toContain('b4');
  });
});
