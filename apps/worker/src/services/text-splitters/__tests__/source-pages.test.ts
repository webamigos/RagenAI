import { attachSourcePages } from '../source-pages';
import type { Document } from '../../../types/Document';

/**
 * Recovering a chunk's page from where it sits in the markdown.
 *
 * The property that matters most is the one a happy path does not cover: a
 * chunk that cannot be placed gets no page at all. Gap 3 exists because a
 * number was shown under the word "page" without being one, and a guessed page
 * repeats that in a form nobody can spot.
 */
const MARKDOWN = [
  'Zasady ogolne umowy najmu lokalu uzytkowego.',
  'Warunki platnosci oraz terminy przelewow.',
  'Postanowienia koncowe i tryb rozwiazania.',
].join('\n\n');

const ANCHORS = [
  { offset: 0, page: 1 },
  { offset: MARKDOWN.indexOf('Warunki'), page: 2 },
  { offset: MARKDOWN.indexOf('Postanowienia'), page: 3 },
];

const chunk = (pageContent: string): Document => ({
  pageContent,
  metadata: { fileName: 'umowa.pdf' },
});

const pagesOf = (chunks: Document[]) =>
  attachSourcePages(chunks, MARKDOWN, ANCHORS).map(
    (c) => c.metadata.sourcePage,
  );

describe('attachSourcePages', () => {
  it('gives each chunk the page it came from', () => {
    expect(
      pagesOf([
        chunk('Zasady ogolne umowy najmu lokalu uzytkowego.'),
        chunk('Warunki platnosci oraz terminy przelewow.'),
        chunk('Postanowienia koncowe i tryb rozwiazania.'),
      ]),
    ).toEqual([1, 2, 3]);
  });

  it('uses the last page that started at or before the chunk', () => {
    // Anchors are sparse — tables and pictures are not anchored, and an
    // element that cannot be located verbatim is skipped. Text between two
    // anchors belongs to the earlier one.
    const [attached] = attachSourcePages(
      [chunk('Postanowienia koncowe i tryb rozwiazania.')],
      MARKDOWN,
      [{ offset: 0, page: 7 }],
    );

    expect(attached.metadata.sourcePage).toBe(7);
  });

  it('gives no page to a chunk it cannot locate', () => {
    // Better a source card without "· page 3" than one carrying the wrong one.
    expect(pagesOf([chunk('Tekst ktorego nie ma w dokumencie.')])).toEqual([
      undefined,
    ]);
  });

  it('handles overlapping chunks, which start before the previous one ends', () => {
    // The search resumes from the previous chunk's *start*. Resuming from its
    // end would skip past an overlapping chunk and match a later repetition.
    expect(
      pagesOf([
        chunk('Zasady ogolne umowy najmu lokalu uzytkowego.\n\nWarunki'),
        chunk('Warunki platnosci oraz terminy przelewow.'),
      ]),
    ).toEqual([1, 2]);
  });

  it('matches the second occurrence of a repeated sentence, not the first', () => {
    // A heading repeated on several pages would otherwise pin every later
    // chunk to the page of its first appearance.
    const markdown = 'Naglowek\n\nPierwsza tresc.\n\nNaglowek\n\nDruga tresc.';
    const attached = attachSourcePages(
      [chunk('Naglowek\n\nPierwsza tresc.'), chunk('Naglowek\n\nDruga tresc.')],
      markdown,
      [
        { offset: 0, page: 1 },
        { offset: markdown.indexOf('Naglowek', 1), page: 2 },
      ],
    );

    expect(attached.map((c) => c.metadata.sourcePage)).toEqual([1, 2]);
  });

  describe('when two chunks open with the same long run of text', () => {
    // A letterhead, a contract's party block, a heading carried onto every
    // page. Once the repeated run is longer than the probe, two different
    // chunks have identical needles — and the second one matched the first
    // one's position, because the search resumes from the previous chunk's
    // start and that offset is still in range. It inherited the wrong page in
    // silence.
    const HEADER =
      'ZAKLADY HYDRAULICZNE WILCZY MLYN SPOLKA Z OGRANICZONA ODPOWIEDZIALNOSCIA';
    const REPEATED = [
      `${HEADER}\n\nTresc pierwszej strony.`,
      `${HEADER}\n\nTresc trzeciej strony.`,
    ];
    const markdown = REPEATED.join('\n\n');
    const anchors = [
      { offset: 0, page: 1 },
      { offset: markdown.indexOf(HEADER, 1), page: 3 },
    ];

    it('tells them apart by what follows the shared opening', () => {
      const attached = attachSourcePages(
        REPEATED.map(chunk),
        markdown,
        anchors,
      );

      expect(attached.map((c) => c.metadata.sourcePage)).toEqual([1, 3]);
    });

    it('places two byte-identical chunks on their own pages', () => {
      // Boilerplate repeated verbatim — the same clause on two pages. There is
      // nothing in the text to tell the copies apart, so this works only
      // because the cursor advances past each match: the second chunk cannot
      // start where the first did, so its search skips that occurrence.
      const identical = `${HEADER}\n\nIdentyczna tresc.`;
      const twice = [identical, identical].join('\n\n');

      const attached = attachSourcePages(
        [chunk(identical), chunk(identical)],
        twice,
        [
          { offset: 0, page: 1 },
          { offset: twice.indexOf(identical, 1), page: 3 },
        ],
      );

      expect(attached.map((c) => c.metadata.sourcePage)).toEqual([1, 3]);
    });

    it('still places a lone candidate the splitter altered', () => {
      // One match and no rival: a mismatch deeper in means a trimmed
      // character, not a wrong position. Dropping the page here would lose a
      // correct answer guarding against an ambiguity that does not exist.
      const markdownOnce = `${HEADER}\n\nTresc  ze  zdwojonymi  spacjami.`;

      const [attached] = attachSourcePages(
        [chunk(`${HEADER}\n\nTresc ze zdwojonymi spacjami.`)],
        markdownOnce,
        [{ offset: 0, page: 4 }],
      );

      expect(attached.metadata.sourcePage).toBe(4);
    });
  });

  it('leaves chunks untouched when there are no anchors', () => {
    // Every legacy loader, and every format Docling reports no pages for.
    const chunks = [chunk('Zasady ogolne umowy najmu lokalu uzytkowego.')];

    expect(attachSourcePages(chunks, MARKDOWN, [])).toEqual(chunks);
  });

  it('does not mutate the chunks it was given', () => {
    const original = chunk('Zasady ogolne umowy najmu lokalu uzytkowego.');

    attachSourcePages([original], MARKDOWN, ANCHORS);

    expect(original.metadata.sourcePage).toBeUndefined();
  });
});
