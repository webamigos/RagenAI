import { describe, expect, it } from 'vitest';

import { toRetrievalEvent } from '../retrieval-event';
import type { RetrievedSource } from '@/libs/chains/types/common';

const source = (overrides: Partial<RetrievedSource> = {}): RetrievedSource => ({
  fileId: 'file-a',
  chunkCount: 1,
  fileName: 'contract.pdf',
  ...overrides,
});

describe('toRetrievalEvent', () => {
  it('sends the snippet, now that the source card quotes it', () => {
    // This file exists because `sources: retrieval.sources` type-checked
    // against `ApiSseRetrievedSource[]` — excess-property checking applies to
    // object literals, not to a variable — and shipped document text to a
    // client that never read it. The mapping is still written out field by
    // field for that reason; what changed is that the snippet is now declared
    // and rendered, so a live turn quotes the same passage a reopened one
    // does.
    const event = toRetrievalEvent({
      sources: [source({ snippet: 'a verbatim extract' })],
      chunkCount: 3,
      durationMs: 90,
    });

    expect(event.sources[0].snippet).toBe('a verbatim extract');
  });

  it('omits an empty snippet rather than sending one', () => {
    // A blank quotation on a card says the model read nothing, where the
    // truth is that the chunk carried no text. Absence is the discriminator
    // here as everywhere else in this payload.
    const event = toRetrievalEvent({
      sources: [source({ snippet: '' })],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(event.sources[0]).not.toHaveProperty('snippet');
  });

  it('sends exactly the declared fields and nothing else', () => {
    const event = toRetrievalEvent({
      sources: [source({ relevanceScore: 0.8, sourcePage: 7, snippet: 'x' })],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(Object.keys(event.sources[0]).sort()).toEqual([
      'chunkCount',
      'fileId',
      'fileName',
      'relevanceScore',
      'snippet',
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

    expect(Object.keys(event.sources[0])).toEqual([
      'fileId',
      'fileName',
      'chunkCount',
    ]);
    expect(JSON.parse(JSON.stringify(event)).sources[0]).toEqual({
      fileId: 'file-a',
      chunkCount: 1,
      fileName: 'contract.pdf',
    });
  });

  it('omits pages rather than sending an empty array', () => {
    // An empty array reads as "came from no pages"; absence says the parser
    // could not tell us. Same rule as `sourcePage`, and the sources rail
    // renders the page list only when it is here.
    const event = toRetrievalEvent({
      sources: [source({ pages: [] })],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(event.sources[0]).not.toHaveProperty('pages');
  });

  it("copies pages rather than handing over the chain's own array", () => {
    const pages = [2, 4, 9];
    const event = toRetrievalEvent({
      sources: [source({ pages })],
      chunkCount: 1,
      durationMs: 10,
    });

    expect(event.sources[0].pages).toEqual([2, 4, 9]);
    expect(event.sources[0].pages).not.toBe(pages);
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
