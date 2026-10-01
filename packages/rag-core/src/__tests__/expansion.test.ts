import { describe, expect, it, vi } from 'vitest';

import {
  expandHits,
  joinTrimmingOverlap,
  mergeExpanded,
  planExpansion,
} from '../selection/expansion';

const chunk = (
  fileId: string,
  chunkIndex: number,
  text = `${fileId}#${chunkIndex}`,
  extra: Record<string, unknown> = {},
) => ({
  pageContent: text,
  metadata: { file_id: fileId, chunk_index: chunkIndex, ...extra },
});

describe('planExpansion', () => {
  it('asks for ±1 around each prose hit, never position 0', () => {
    const plan = planExpansion([chunk('a', 5), chunk('b', 1)], { budget: 12 });
    expect(Object.fromEntries(plan)).toEqual({ a: [4, 6], b: [2] });
  });

  it('skips summary and table hits, and chunks without a position', () => {
    const plan = planExpansion(
      [
        chunk('a', 1, 'summary', { chunk_type: 'summary' }),
        chunk('a', 9, 'table', { chunk_type: 'table' }),
        { pageContent: 'thread document', metadata: {} },
      ],
      { budget: 12 },
    );
    expect(plan.size).toBe(0);
  });

  it('does not fetch a position that is already a hit or already planned', () => {
    const plan = planExpansion([chunk('a', 5), chunk('a', 6), chunk('a', 8)], {
      budget: 12,
    });
    expect(plan.get('a')).toEqual([4, 7, 9]);
  });

  it('spends the budget in rank order, leaving later hits unexpanded', () => {
    // Three hits and a budget of five: two neighbours, both for the first.
    const plan = planExpansion([chunk('a', 5), chunk('b', 5), chunk('c', 5)], {
      budget: 5,
    });
    expect(Object.fromEntries(plan)).toEqual({ a: [4, 6] });
  });
});

describe('joinTrimmingOverlap', () => {
  const overlap = 'the splitter repeats this sentence. ';

  it('drops the overlap between consecutive chunks', () => {
    expect(
      joinTrimmingOverlap(`First part, ${overlap}`, `${overlap}second part.`),
    ).toBe(`First part, ${overlap}second part.`);
  });

  it('joins with a newline and drops nothing when there is no overlap', () => {
    expect(joinTrimmingOverlap('One.', 'Two.')).toBe('One.\nTwo.');
  });

  it('does not treat a short coincidence as overlap', () => {
    expect(joinTrimmingOverlap('ends with the', 'the start')).toBe(
      'ends with the\nthe start',
    );
  });
});

describe('mergeExpanded', () => {
  it('renders a section as one document with the hit’s metadata and every position', () => {
    const hit = chunk('a', 5, 'five', { relevance_score: 0.9 });
    const [doc] = mergeExpanded([
      { hit, chunks: [chunk('a', 6, 'six'), hit, chunk('a', 4, 'four')] },
    ]);
    expect(doc.pageContent).toBe('four\nfive\nsix');
    expect(doc.metadata).toMatchObject({
      file_id: 'a',
      chunk_index: 5,
      relevance_score: 0.9,
      expanded_chunk_indexes: [4, 5, 6],
    });
  });

  it('merges two sections of one file that touch into the better-ranked one', () => {
    const first = chunk('a', 5);
    const second = chunk('a', 8);
    const docs = mergeExpanded([
      { hit: first, chunks: [chunk('a', 4), first, chunk('a', 6)] },
      { hit: second, chunks: [chunk('a', 7), second, chunk('a', 9)] },
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata.chunk_index).toBe(5);
    expect(docs[0].metadata.expanded_chunk_indexes).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('keeps sections apart when they do not touch, or are in other files', () => {
    const docs = mergeExpanded([
      { hit: chunk('a', 2), chunks: [chunk('a', 2), chunk('a', 3)] },
      { hit: chunk('b', 4), chunks: [chunk('b', 4)] },
      { hit: chunk('a', 9), chunks: [chunk('a', 9), chunk('a', 10)] },
    ]);
    expect(docs.map((d) => d.metadata.file_id)).toEqual(['a', 'b', 'a']);
  });

  it('returns a lone hit untouched', () => {
    const hit = chunk('a', 5);
    expect(mergeExpanded([{ hit, chunks: [hit] }])).toEqual([hit]);
  });
});

describe('expandHits', () => {
  it('fetches once per file and renders each hit with its neighbours', async () => {
    const fetchChunks = vi.fn((fileId: string, indexes: number[]) =>
      Promise.resolve(indexes.map((i) => chunk(fileId, i))),
    );
    const result = await expandHits({
      hits: [chunk('a', 5), chunk('b', 2)],
      maxDocuments: 4,
      fetchChunks,
    });

    expect(fetchChunks).toHaveBeenCalledTimes(2);
    expect(fetchChunks).toHaveBeenCalledWith('a', [4, 6]);
    expect(result.docs.map((d) => d.metadata.expanded_chunk_indexes)).toEqual([
      [4, 5, 6],
      [1, 2, 3],
    ]);
    expect(result.addedChunks).toBe(4);
    expect(result.failedFiles).toBe(0);
  });

  it('renders a file’s hits unexpanded when its lookup fails, and the rest widened', async () => {
    const result = await expandHits({
      hits: [chunk('a', 5), chunk('b', 5)],
      maxDocuments: 4,
      fetchChunks: (fileId, indexes) =>
        fileId === 'a'
          ? Promise.reject(new Error('qdrant down'))
          : Promise.resolve(indexes.map((i) => chunk(fileId, i))),
    });

    expect(result.docs[0]).toEqual(chunk('a', 5));
    expect(result.docs[1].metadata.expanded_chunk_indexes).toEqual([4, 5, 6]);
    expect(result.failedFiles).toBe(1);
  });

  it('leaves a missing neighbour missing', async () => {
    const result = await expandHits({
      hits: [chunk('a', 5)],
      maxDocuments: 4,
      fetchChunks: () => Promise.resolve([chunk('a', 6)]),
    });
    expect(result.docs[0].metadata.expanded_chunk_indexes).toEqual([5, 6]);
  });

  it('ignores what it did not ask for, even if the lookup returns it', async () => {
    const result = await expandHits({
      hits: [chunk('a', 5)],
      maxDocuments: 4,
      fetchChunks: () =>
        Promise.resolve([
          chunk('other-file', 4),
          chunk('a', 12),
          chunk('a', 4, 'table', { chunk_type: 'table' }),
        ]),
    });
    expect(result.docs).toEqual([chunk('a', 5)]);
    expect(result.addedChunks).toBe(0);
  });

  it('asks nothing when no hit can be widened', async () => {
    const fetchChunks = vi.fn();
    const hits = [{ pageContent: 'thread document', metadata: {} }];
    const result = await expandHits({ hits, maxDocuments: 4, fetchChunks });
    expect(result.docs).toEqual(hits);
    expect(fetchChunks).not.toHaveBeenCalled();
  });
});
