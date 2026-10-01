vi.mock('../../reranker/index.js', () => ({
  rerankDocuments: vi.fn(),
  isRerankingEnabled: () => false,
}));

import { retrieveRelevantDocumentsWithIds } from './operations.js';
import type { VectorStoreClient } from '../../vector-store/types.js';

type Chunk = { pageContent: string; metadata: Record<string, unknown> };

const chunk = (fileId: string, chunkIndex: number, text: string): Chunk => ({
  pageContent: text,
  metadata: {
    file_id: fileId,
    file_name: `${fileId}.pdf`,
    chunk_index: chunkIndex,
  },
});

/**
 * `contextExpansion` (spec 2026-09-29-llm-document-selection, B3), the same
 * behaviour as apps/web's chain: both call rag-core's `expandHits`, which
 * `both-rag-chains-expand-through-rag-core.test.ts` holds them to.
 */
describe('retrieveRelevantDocumentsWithIds — context expansion', () => {
  const filter = {
    must: [{ key: 'metadata.organization_id', match: { value: 'org-1' } }],
  };

  function expandingStore(hits: Chunk[]) {
    const getChunksByIndex = vi.fn(
      (_orgId: string, fileId: string, indexes: readonly number[]) =>
        Promise.resolve(
          indexes.map((i) => chunk(fileId, i, `${fileId} neighbour ${i}.`)),
        ),
    );
    const store: VectorStoreClient = {
      similaritySearch: vi.fn(() => Promise.resolve(hits)),
      addDocuments: vi.fn(),
      getChunksByIndex,
    };
    return { store, getChunksByIndex };
  }

  it('renders each hit with its neighbours, inside the search filter', async () => {
    const { store, getChunksByIndex } = expandingStore([
      chunk('f-1', 5, 'The hit.'),
    ]);
    const { context, fileIds } = await retrieveRelevantDocumentsWithIds(
      store,
      'q',
      4,
      filter,
      false,
      undefined,
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
    expect(fileIds).toEqual(['f-1']);
  });

  it('does nothing when the key is off, which is the default', async () => {
    const { store, getChunksByIndex } = expandingStore([
      chunk('f-1', 5, 'The hit.'),
    ]);
    await retrieveRelevantDocumentsWithIds(store, 'q', 4, filter, false);
    expect(getChunksByIndex).not.toHaveBeenCalled();
  });

  it('renders the hit alone when the lookup fails', async () => {
    const { store, getChunksByIndex } = expandingStore([
      chunk('f-1', 5, 'The hit.'),
    ]);
    getChunksByIndex.mockRejectedValue(new Error('qdrant down'));

    const { context } = await retrieveRelevantDocumentsWithIds(
      store,
      'q',
      4,
      filter,
      false,
      undefined,
      undefined,
      { orgId: 'org-1' },
    );
    expect(context).toContain('The hit.');
    expect(context).not.toContain('neighbour');
  });
});
