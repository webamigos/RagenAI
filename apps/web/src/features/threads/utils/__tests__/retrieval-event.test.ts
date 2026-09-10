import { describe, expect, it } from 'vitest';

import { toRetrievalEvent } from '../retrieval-event';
import type { RetrievedSource } from '@/libs/chains/types/common';

const source = (overrides: Partial<RetrievedSource> = {}): RetrievedSource => ({
  fileId: 'file-a',
  fileName: 'contract.pdf',
  ...overrides,
});

describe('toRetrievalEvent', () => {
  it('does not send the snippet to the browser', () => {
    // The regression this file exists for. `sources: retrieval.sources`
    // type-checked against `ApiSseRetrievedSource[]`, because excess-property
    // checking applies to object literals and not to a variable — so up to
    // 2 kB of document text per source went to a client that never read it.
    const event = toRetrievalEvent({
      sources: [source({ snippet: 'a'.repeat(2000) })],
      chunkCount: 3,
      durationMs: 90,
    });

    expect(event.sources[0]).not.toHaveProperty('snippet');
    expect(JSON.stringify(event)).not.toContain('aaa');
  });

  it('sends exactly the declared fields and nothing else', () => {
    const event = toRetrievalEvent({
      sources: [source({ relevanceScore: 0.8, sourcePage: 7, snippet: 'x' })],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(Object.keys(event.sources[0]).sort()).toEqual([
      'fileId',
      'fileName',
      'relevanceScore',
      'sourcePage',
    ]);
  });

  it('omits an optional field rather than sending it as undefined', () => {
    // Absence is what the receiving side reads: no score means reranking did
    // not run, no page means the parser could not say. A key present with
    // `undefined` survives neither JSON nor that distinction.
    const event = toRetrievalEvent({
      sources: [source()],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(Object.keys(event.sources[0])).toEqual(['fileId', 'fileName']);
    expect(JSON.parse(JSON.stringify(event)).sources[0]).toEqual({
      fileId: 'file-a',
      fileName: 'contract.pdf',
    });
  });

  it('keeps a zero score, which is a measurement', () => {
    // `!== undefined`, not truthiness: 0 means the reranker judged this
    // document irrelevant, which is a different statement from not having
    // asked it.
    const event = toRetrievalEvent({
      sources: [source({ relevanceScore: 0 })],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(event.sources[0].relevanceScore).toBe(0);
  });

  it('keeps a null file name, because the file was still retrieved', () => {
    const event = toRetrievalEvent({
      sources: [source({ fileName: null })],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(event.sources[0].fileName).toBeNull();
  });

  it('passes the counts through unchanged', () => {
    const event = toRetrievalEvent({
      sources: [],
      chunkCount: 0,
      durationMs: 42,
    });

    // A turn that searched and found nothing still reports, because "found
    // nothing" is an answer about the knowledge base.
    expect(event).toEqual({ sources: [], chunkCount: 0, durationMs: 42 });
  });

  it('keeps the order it was given, which is the citation order', () => {
    const event = toRetrievalEvent({
      sources: [
        source({ fileId: 'first' }),
        source({ fileId: 'second' }),
        source({ fileId: 'third' }),
      ],
      chunkCount: 3,
      durationMs: 10,
    });

    // `[1]` in the answer is the first of these; reordering here would
    // renumber every citation.
    expect(event.sources.map((s) => s.fileId)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });
});
