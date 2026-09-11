import { describe, expect, it } from 'vitest';

import { selectCitedSources } from '../cited-sources';

/**
 * The three documents the demo tenant is seeded with
 * (`scripts/seed-demo-organization.ts`), and an answer the demo actually gave.
 * With a corpus this small every question retrieves all three, which is how
 * one question produced three "citations" on the analytics screen.
 */
const DEMO_SOURCES = [
  {
    fileId: 'f-overview',
    fileName: 'Ragen — product overview.md',
    chunkCount: 1,
  },
  {
    fileId: 'f-handbook',
    chunkCount: 1,
    fileName: 'Sample handbook — expenses and travel.md',
  },
  {
    fileId: 'f-faq',
    fileName: 'Sample FAQ — support and availability.md',
    chunkCount: 1,
  },
];

const DEMO_ANSWER =
  "According to 'Sample FAQ — support and availability.md', a first response to a support ticket is provided within one business day. However, if a ticket is marked as blocking production, it is answered within four business hours.";

describe('selectCitedSources', () => {
  it('counts one citation for the demo answer, not three', () => {
    // The regression this module exists for: retrieved is three, cited is one.
    const cited = selectCitedSources(DEMO_SOURCES, DEMO_ANSWER);

    expect(cited.map((s) => s.fileId)).toEqual(['f-faq']);
  });

  it('returns nothing when the answer names no retrieved file', () => {
    // An answer given without a citation is a fact about the answer. It must
    // not be rounded up to "cited everything it was shown".
    expect(
      selectCitedSources(
        DEMO_SOURCES,
        'Support is available on weekdays between 9:00 and 17:00.',
      ),
    ).toEqual([]);
  });

  it('keeps every file the answer names, in retrieval order', () => {
    const answer =
      "According to 'Sample handbook — expenses and travel.md', trains are second class. 'Ragen — product overview.md' adds that answers are cited.";

    expect(
      selectCitedSources(DEMO_SOURCES, answer).map((s) => s.fileId),
    ).toEqual(['f-overview', 'f-handbook']);
  });

  it('ignores case', () => {
    expect(
      selectCitedSources(
        DEMO_SOURCES,
        "according to 'sample faq — SUPPORT and availability.MD', within a day.",
      ).map((s) => s.fileId),
    ).toEqual(['f-faq']);
  });

  it('accepts a long file name cited without its extension', () => {
    expect(
      selectCitedSources(
        DEMO_SOURCES,
        "According to 'Sample FAQ — support and availability', one business day.",
      ).map((s) => s.fileId),
    ).toEqual(['f-faq']);
  });

  it('does not let a short stem match ordinary prose', () => {
    // `faq.md` → stem `faq`, which appears in almost any support answer.
    const sources = [{ fileId: 'f-short', fileName: 'faq.md', chunkCount: 1 }];

    expect(
      selectCitedSources(sources, 'The FAQ says one business day.'),
    ).toEqual([]);
    expect(
      selectCitedSources(
        sources,
        "According to 'faq.md', one business day.",
      ).map((s) => s.fileId),
    ).toEqual(['f-short']);
  });

  it('never cites a file that was not retrieved', () => {
    // A name the model was never shown cannot be a citation — the retrieved
    // set is the candidate list, whatever the prose contains.
    const answer =
      "According to 'Sample FAQ — support and availability.md', yes.";

    expect(selectCitedSources([DEMO_SOURCES[0]], answer)).toEqual([]);
  });

  it('skips sources with no file name and deduplicates by file id', () => {
    const sources = [
      { fileId: 'f-legacy', fileName: null, chunkCount: 1 },
      {
        fileId: 'f-faq',
        fileName: 'Sample FAQ — support and availability.md',
        chunkCount: 1,
      },
      {
        fileId: 'f-faq',
        fileName: 'Sample FAQ — support and availability.md',
        chunkCount: 1,
      },
    ];

    expect(
      selectCitedSources(sources, DEMO_ANSWER).map((s) => s.fileId),
    ).toEqual(['f-faq']);
  });

  it('counts both files when two retrieved files share the cited name', () => {
    // The citation names a file, and two files carry that name — the model
    // cannot disambiguate, so neither can this. Both rows are written, each
    // under its own id; nothing is collapsed onto a shared name.
    const sources = [
      { fileId: 'f-project-a', fileName: 'policy.pdf', chunkCount: 1 },
      { fileId: 'f-project-b', fileName: 'policy.pdf', chunkCount: 1 },
      { fileId: 'f-other', fileName: 'other.pdf', chunkCount: 1 },
    ];

    expect(
      selectCitedSources(sources, "According to 'policy.pdf', yes.").map(
        (s) => s.fileId,
      ),
    ).toEqual(['f-project-a', 'f-project-b']);
  });

  it('returns nothing for an empty answer or an empty retrieval', () => {
    expect(selectCitedSources(DEMO_SOURCES, '   ')).toEqual([]);
    expect(selectCitedSources([], DEMO_ANSWER)).toEqual([]);
  });
});
