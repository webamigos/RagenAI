import { describe, it, expect } from 'vitest';

import { attributableCitations } from '../attributable-citations';

const src = (fileId: string, fileName: string | null) => ({ fileId, fileName });

describe('attributableCitations', () => {
  it('attributes a cited file whose name is unique', () => {
    const sources = [src('a', 'umowa.pdf'), src('b', 'regulamin.pdf')];

    expect([...attributableCitations(sources, ['a'])]).toEqual(['a']);
  });

  it('attributes to none when two retrieved files share the cited name', () => {
    // The decision this file exists for. The model cites by name, names are
    // not unique in this product, and showing both cards would tell the reader
    // an answer came from a document it may never have drawn on. A missing
    // card is a smaller lie than a wrong one.
    const sources = [src('a', 'umowa.pdf'), src('b', 'umowa.pdf')];

    expect([...attributableCitations(sources, ['a', 'b'])]).toEqual([]);
  });

  it('still drops the ambiguous one when only one of the pair was cited', () => {
    // `selectCitedSources` counts both, but even if it did not, the reader
    // cannot be told which of two identically named documents was meant.
    const sources = [src('a', 'umowa.pdf'), src('b', 'umowa.pdf')];

    expect([...attributableCitations(sources, ['a'])]).toEqual([]);
  });

  it('leaves unambiguous siblings alone when another name is ambiguous', () => {
    const sources = [
      src('a', 'umowa.pdf'),
      src('b', 'umowa.pdf'),
      src('c', 'regulamin.pdf'),
    ];

    expect([...attributableCitations(sources, ['a', 'b', 'c'])]).toEqual(['c']);
  });

  it('compares names case- and unicode-insensitively', () => {
    // Two files differing only in case are the same name to a reader, and the
    // model's rendering of either is the same citation.
    const sources = [src('a', 'Umowa.pdf'), src('b', 'umowa.PDF')];

    expect([...attributableCitations(sources, ['a', 'b'])]).toEqual([]);
  });

  it('drops a cited file that has no name', () => {
    // It cannot have been cited by name, so something upstream changed.
    const sources = [src('a', null)];

    expect([...attributableCitations(sources, ['a'])]).toEqual([]);
  });

  it('does not let unnamed files make a named one ambiguous', () => {
    const sources = [src('a', 'umowa.pdf'), src('b', null), src('c', null)];

    expect([...attributableCitations(sources, ['a'])]).toEqual(['a']);
  });

  it('returns nothing when the answer cited nothing', () => {
    const sources = [src('a', 'umowa.pdf')];

    expect([...attributableCitations(sources, [])]).toEqual([]);
  });

  it('ignores a cited id that was never retrieved', () => {
    // Only the retrieved set can be shown, so an id from anywhere else is not
    // renderable — and is a bug worth failing closed on.
    const sources = [src('a', 'umowa.pdf')];

    expect([...attributableCitations(sources, ['zzz'])]).toEqual([]);
  });
});
