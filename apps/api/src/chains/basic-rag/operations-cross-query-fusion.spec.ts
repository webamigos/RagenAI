vi.mock('../../reranker/index.js', () => ({
  rerankDocuments: vi.fn(),
  isRerankingEnabled: () => false,
}));

import { retrieveRelevantDocumentsWithIds } from './operations.js';
import type { VectorStoreClient } from '../../vector-store/types.js';

type Chunk = { pageContent: string; metadata: Record<string, unknown> };

const chunk = (fileId: string, text: string): Chunk => ({
  pageContent: text,
  metadata: { file_id: fileId, file_name: `${fileId}.pdf`, chunk_index: 1 },
});

/**
 * `crossQueryFusion` (spec 2026-10-03-retrieval-claims, B0), the same
 * behaviour as apps/web's chain: both call rag-core's `fuseAcrossQueries`.
 */
describe('retrieveRelevantDocumentsWithIds — cross-query fusion', () => {
  const lists: Record<string, Chunk[]> = {
    standalone: ['a1', 'a2', 'a3', 'a4'].map((t) => chunk('f-a', t)),
    variant: ['b1', 'b2', 'b3', 'b4'].map((t) => chunk('f-b', t)),
  };
  const store: VectorStoreClient = {
    similaritySearch: vi.fn((query: string) =>
      Promise.resolve(lists[query] ?? []),
    ),
    addDocuments: vi.fn(),
  };
  const run = (crossQueryFusion?: boolean) =>
    retrieveRelevantDocumentsWithIds(
      store,
      ['standalone', 'variant'],
      4,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      crossQueryFusion,
    );

  it('keeps only the first query’s hits when the key is off', async () => {
    const { context, fileIds } = await run();
    expect(context).not.toContain('b1');
    expect(fileIds).toEqual(['f-a']);
  });

  it('lets the variant’s best hits in when the key is on', async () => {
    const { context, fileIds } = await run(true);
    expect(context).toContain('b1');
    expect(context).not.toContain('a4');
    expect(fileIds).toEqual(['f-a', 'f-b']);
  });
});
