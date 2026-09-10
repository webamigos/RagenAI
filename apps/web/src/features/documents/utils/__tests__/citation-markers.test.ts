import { describe, it, expect } from 'vitest';

import { parseCitationMarkers } from '../citation-markers';
import { selectCitedSources } from '../cited-sources';

const SOURCES = [
  { fileId: 'a', fileName: 'umowa.pdf' },
  { fileId: 'b', fileName: 'regulamin.pdf' },
  { fileId: 'c', fileName: 'cennik.pdf' },
];

describe('parseCitationMarkers', () => {
  it('reads a marker as the source it names', () => {
    const { sources } = parseCitationMarkers(
      'Tak wynika z umowy [1].',
      SOURCES,
    );

    expect(sources.map((s) => s.fileId)).toEqual(['a']);
  });

  it('reads a run of markers on one sentence', () => {
    const { numbers } = parseCitationMarkers('Obie zasady [1][3].', SOURCES);

    expect(numbers).toEqual([1, 3]);
  });

  it('counts a repeated marker once', () => {
    const { sources } = parseCitationMarkers(
      'Raz [2]. I jeszcze raz [2].',
      SOURCES,
    );

    expect(sources).toHaveLength(1);
  });

  it('drops a marker naming a source that was never retrieved', () => {
    // The claim gap 2 exists to stop. `[9]` looks exactly as authoritative as
    // `[1]` to a reader, and only the retrieved set can tell them apart.
    const { sources, invalid } = parseCitationMarkers('Wynika z [9].', SOURCES);

    expect(sources).toEqual([]);
    expect(invalid).toEqual([9]);
  });

  it('keeps the valid markers in a mixed answer', () => {
    const { numbers, invalid } = parseCitationMarkers(
      'Pierwsze [1], drugie [7].',
      SOURCES,
    );

    expect(numbers).toEqual([1]);
    expect(invalid).toEqual([7]);
  });

  it('rejects [0], which numbers nothing', () => {
    expect(parseCitationMarkers('Zero [0].', SOURCES).sources).toEqual([]);
  });

  it.each([
    ['a markdown reference link', 'See [the docs][1] for more.'],
    ['a footnote', 'Some claim.[^1]'],
  ])('does not read %s as a citation', (_what, answer) => {
    // A false positive here invents a citation, which is the failure this
    // whole feature exists to remove.
    expect(parseCitationMarkers(answer, SOURCES).numbers).toEqual([]);
  });

  it('returns nothing for an answer with no markers', () => {
    expect(parseCitationMarkers('Nie wiem.', SOURCES).numbers).toEqual([]);
  });
});

describe('selectCitedSources, once markers exist', () => {
  it('uses the markers when the answer has them', () => {
    const cited = selectCitedSources(SOURCES, 'Tak wynika [2].');

    expect(cited.map((s) => s.fileId)).toEqual(['b']);
  });

  it('does not also scan for names when markers were used', () => {
    // Merging the two would re-add the ambiguity markers remove: a document
    // mentioned in passing is not a citation.
    const cited = selectCitedSources(
      SOURCES,
      'Zgodnie z [2], choc umowa.pdf mowi inaczej.',
    );

    expect(cited.map((s) => s.fileId)).toEqual(['b']);
  });

  it('falls back to names when the answer has no markers', () => {
    // Chunks with no file_id get no source attribute and must be cited by
    // name; older answers in reopened threads have no markers either.
    const cited = selectCitedSources(SOURCES, "According to 'umowa.pdf', tak.");

    expect(cited.map((s) => s.fileId)).toEqual(['a']);
  });

  it('falls back to names when every marker was invalid', () => {
    const cited = selectCitedSources(
      SOURCES,
      "Wedlug [9]. According to 'regulamin.pdf', tak.",
    );

    expect(cited.map((s) => s.fileId)).toEqual(['b']);
  });
});
