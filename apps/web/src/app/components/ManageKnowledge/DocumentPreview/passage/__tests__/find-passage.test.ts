import { describe, expect, it } from 'vitest';

import {
  findFoldedPassage,
  findMatchingRows,
  findPassage,
  foldSnippet,
  foldText,
} from '../find-passage';

const DOCUMENT = [
  'Regulamin zwrotów',
  'Klient może zwrócić towar w ciągu 14 dni od dnia doręczenia, bez podawania przyczyny.',
  'Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie 14 dni.',
  'Reklamacje rozpatruje dział obsługi klienta, kontakt: Jan Kowalski, jan@example.com.',
].join('\n');

/** The substring of `haystack` a match points at. */
const marked = (haystack: string, snippet: string) => {
  const match = findPassage(haystack, snippet);
  return match ? haystack.slice(match.start, match.end) : null;
};

describe('foldText', () => {
  it('keeps letters and digits, lower-cased, with their source offsets', () => {
    const folded = foldText('A-b 1!');
    expect(folded.text).toBe('ab1');
    expect(Array.from(folded.sourceIndex)).toEqual([0, 2, 4]);
  });

  it('folds diacritics and compatibility forms the same on both sides', () => {
    expect(foldText('Zażółć').text).toBe(foldText('Zażółć').text);
    // The "fi" ligature pdf.js reports for some fonts.
    expect(foldText('ﬁle').text).toBe('file');
  });
});

describe('foldSnippet', () => {
  it('drops Markdown syntax, link targets and HTML comments', () => {
    expect(
      foldSnippet(
        '## Title\n\n- **Bold** [link](https://x.io/a) <!-- image -->',
      ),
    ).toBe('titleboldlink');
  });

  it('turns each PII placeholder into one wildcard', () => {
    expect(foldSnippet('kontakt: <PERSON>, <EMAIL_ADDRESS_1>')).toBe(
      'kontakt\u0000\u0000',
    );
    expect(foldSnippet('PESEL [PESEL] i [redacted person]')).toBe(
      'pesel\u0000i\u0000',
    );
  });

  it('leaves lower-case markup alone rather than calling it a placeholder', () => {
    expect(foldSnippet('<b>bold</b>')).toBe('bold');
  });
});

describe('findPassage', () => {
  it('takes a closing full stop along, but not a comma the sentence continues past', () => {
    expect(marked('Jest tak. Dalej.', 'Zdanie jest tak')).toBeNull();
    expect(
      marked(
        DOCUMENT,
        'Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie 14 dni',
      ),
    ).toBe(
      'Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie 14 dni.',
    );
    expect(
      marked(
        DOCUMENT,
        'Klient może zwrócić towar w ciągu 14 dni od dnia doręczenia',
      ),
    ).toBe('Klient może zwrócić towar w ciągu 14 dni od dnia doręczenia');
  });

  it('finds a verbatim passage', () => {
    expect(
      marked(
        DOCUMENT,
        'Klient może zwrócić towar w ciągu 14 dni od dnia doręczenia',
      ),
    ).toBe('Klient może zwrócić towar w ciągu 14 dni od dnia doręczenia');
  });

  it('ignores Markdown the page does not show', () => {
    const snippet =
      '### Regulamin zwrotów\n\n**Klient** może zwrócić _towar_ w ciągu 14 dni od dnia doręczenia, bez podawania przyczyny.';
    const found = marked(DOCUMENT, snippet);
    expect(found?.startsWith('Regulamin zwrotów')).toBe(true);
    // The full stop closing the sentence is marked with it.
    expect(found?.endsWith('przyczyny.')).toBe(true);
  });

  it('ignores whitespace and line breaks that differ', () => {
    const snippet =
      'Zwrot   środków\nnastępuje na rachunek\n\nwskazany przez klienta, najpóźniej w terminie';
    expect(marked(DOCUMENT, snippet)).toBe(
      'Zwrot środków następuje na rachunek wskazany przez klienta, najpóźniej w terminie',
    );
  });

  it('is case-insensitive', () => {
    expect(
      marked(DOCUMENT, 'KLIENT MOŻE ZWRÓCIĆ TOWAR W CIĄGU 14 DNI OD DNIA'),
    ).toBe('Klient może zwrócić towar w ciągu 14 dni od dnia');
  });

  it('treats PII placeholders as wildcards over the real values', () => {
    const snippet =
      'Reklamacje rozpatruje dział obsługi klienta, kontakt: <PERSON>, jan@example.com.';
    expect(marked(DOCUMENT, snippet)).toBe(
      'Reklamacje rozpatruje dział obsługi klienta, kontakt: Jan Kowalski, jan@example.com.',
    );
  });

  it('stops at a placeholder that ends the snippet, with nothing after it to anchor on', () => {
    const snippet =
      'Reklamacje rozpatruje dział obsługi klienta, kontakt: <PERSON>, <EMAIL_ADDRESS>.';
    expect(marked(DOCUMENT, snippet)).toBe(
      'Reklamacje rozpatruje dział obsługi klienta, kontakt',
    );
  });

  it('treats redacted markers as wildcards too', () => {
    const snippet =
      'dział obsługi klienta, kontakt: [redacted person], [redacted email address].';
    expect(marked(DOCUMENT, snippet)?.startsWith('dział obsługi')).toBe(true);
  });

  it('resynchronises past list numbers Markdown spelled out', () => {
    const page =
      'Warunki\nPierwszy warunek dotyczy zwrotu towaru w terminie.\nDrugi warunek dotyczy stanu opakowania po otwarciu.';
    const snippet =
      '1. Pierwszy warunek dotyczy zwrotu towaru w terminie.\n2. Drugi warunek dotyczy stanu opakowania po otwarciu.';
    expect(marked(page, snippet)).toBe(
      'Pierwszy warunek dotyczy zwrotu towaru w terminie.\nDrugi warunek dotyczy stanu opakowania po otwarciu.',
    );
  });

  it('finds a CSV chunk whose repeated header is not beside its rows', () => {
    const csv = [
      'name,amount,owner',
      ...Array.from({ length: 30 }, (_, i) => `item ${i},${i * 10},team ${i}`),
    ].join('\n');
    const snippet = [
      'name,amount,owner',
      'item 20,200,team 20',
      'item 21,210,team 21',
      'item 22,220,team 22',
    ].join('\n');
    expect(marked(csv, snippet)).toBe(
      'item 20,200,team 20\nitem 21,210,team 21\nitem 22,220,team 22',
    );
  });

  it('finds the part of a passage that is on this page', () => {
    // The chunk continues onto a page this haystack does not hold.
    const snippet = `${DOCUMENT.split('\n')[1]} ${'Tekst z następnej strony, którego tu nie ma. '.repeat(4)}`;
    const match = findPassage(DOCUMENT, snippet);
    expect(match).not.toBeNull();
    expect(match!.coverage).toBeLessThan(0.6);
  });

  it('returns null when the passage is not in the document', () => {
    expect(
      findPassage(
        DOCUMENT,
        'Gwarancja obejmuje wyłącznie wady fabryczne produktu przez 24 miesiące.',
      ),
    ).toBeNull();
  });

  it('does not accept a short coincidence inside a long snippet', () => {
    // "w ciągu 14 dni" is in the document, and nothing else is.
    expect(
      findPassage(
        DOCUMENT,
        'Serwis naprawia sprzęt w ciągu 14 dni roboczych od przyjęcia zgłoszenia przez punkt.',
      ),
    ).toBeNull();
  });

  it('returns null for an empty or near-empty snippet', () => {
    expect(findPassage(DOCUMENT, '')).toBeNull();
    expect(findPassage(DOCUMENT, '## |---|')).toBeNull();
    expect(findPassage('', 'Klient może zwrócić towar')).toBeNull();
  });

  it('reuses one folded haystack for many snippets', () => {
    const folded = foldText(DOCUMENT);
    expect(
      findFoldedPassage(
        folded,
        foldSnippet('Zwrot środków następuje na rachunek wskazany'),
      ),
    ).not.toBeNull();
    expect(
      findFoldedPassage(
        folded,
        foldSnippet('Nic takiego tu nie jest zapisane w ogóle'),
      ),
    ).toBeNull();
  });
});

describe('findMatchingRows', () => {
  const rows = [
    ['Policy', 'Days', 'Owner'],
    ['Refund', '14', 'finance'],
    ['Exchange', '30', 'support'],
    ['Warranty', '24 months', 'Jan Kowalski'],
  ];

  it('matches Markdown table rows cell for cell', () => {
    const snippet =
      '| Policy | Days | Owner |\n| --- | --- | --- |\n| Exchange | 30 | support |';
    expect(findMatchingRows(rows, snippet)).toEqual([0, 2]);
  });

  it('matches CSV lines, quoting and all', () => {
    expect(findMatchingRows(rows, '"Refund",14,"finance"')).toEqual([1]);
  });

  it('lets a placeholder stand for a masked cell', () => {
    expect(
      findMatchingRows(rows, '| Warranty | 24 months | <PERSON> |'),
    ).toEqual([3]);
  });

  it('matches a row from a long enough part of it', () => {
    const notes = [
      ['Notes'],
      [
        'Prices exclude the fuel surcharge, which is updated monthly. Discounts above 12% require approval.',
      ],
    ];
    // A cell cut at the snippet ceiling, and fragments joined by an ellipsis.
    expect(
      findMatchingRows(
        notes,
        'Prices exclude the fuel surcharge, which is upd',
      ),
    ).toEqual([1]);
    expect(
      findMatchingRows(
        [...rows, ...notes],
        'Exchange | 30 | support … Prices exclude the fuel surcharge',
      ),
    ).toEqual([2, 5]);
    // Too short to be anything but a coincidence.
    expect(findMatchingRows(notes, 'Prices')).toEqual([]);
  });

  it('matches nothing when no row is quoted', () => {
    expect(findMatchingRows(rows, '| Loyalty | 90 | marketing |')).toEqual([]);
    expect(findMatchingRows(rows, '')).toEqual([]);
  });
});
