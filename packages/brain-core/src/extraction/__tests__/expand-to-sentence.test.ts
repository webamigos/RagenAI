import { describe, expect, it } from 'vitest';

import { expandToSentence, QuoteIndex } from '../verify-quotes';

const widen = (text: string, quote: string, max = 400) => {
  const index = new QuoteIndex(text);
  const at = index.locate(quote);
  expect(at, `"${quote}" should be found`).not.toBeNull();
  return expandToSentence(index.source, at!, max);
};

describe('QuoteIndex.locate', () => {
  it('cuts the match back out in the source’s own words', () => {
    const index = new QuoteIndex('Wniosek  składa się\nw systemie „kadrowym”.');
    const at = index.locate('wniosek składa się w systemie "kadrowym"');
    expect(index.source.slice(at!.start, at!.end)).toBe(
      'Wniosek  składa się\nw systemie „kadrowym”',
    );
  });

  it('counts occurrences, so an ambiguous anchor can be told apart', () => {
    const index = new QuoteIndex('Opłata 10 zł. Druga opłata 10 zł.');
    expect(index.occurrences('10 zł')).toBe(2);
    expect(index.occurrences('Druga opłata')).toBe(1);
  });
});

describe('expandToSentence', () => {
  it('widens a fragment to the sentence it is in', () => {
    expect(
      widen(
        'Zwroty są możliwe. Okres próbny trwa 23 dni kalendarzowe od aktywacji. Potem płatny.',
        '23 dni',
      ),
    ).toBe('Okres próbny trwa 23 dni kalendarzowe od aktywacji.');
  });

  // Polish legal text is full of full stops that end nothing.
  it('does not stop at an abbreviation', () => {
    expect(
      widen(
        'Usługodawcą jest Vertigo Nebula sp. z o.o. z siedzibą przy ul. Kwarcowej 118/4, NIP 7412998301. Kontakt mailowy.',
        'NIP 7412998301',
      ),
    ).toBe(
      'Usługodawcą jest Vertigo Nebula sp. z o.o. z siedzibą przy ul. Kwarcowej 118/4, NIP 7412998301.',
    );
  });

  it('joins a sentence wrapped across lines', () => {
    expect(
      widen(
        'Wniosek składa się w systemie\nkadrowym co najmniej 14 dni wcześniej.',
        '14 dni',
      ),
    ).toBe(
      'Wniosek składa się w systemie\nkadrowym co najmniej 14 dni wcześniej.',
    );
  });

  it('keeps a list item as that item, without its marker', () => {
    expect(
      widen(
        'Opłaty:\n- bagaż podręczny 0 zł\n- rower 15 zł\n- zwierzę 10 zł',
        'rower',
      ),
    ).toBe('rower 15 zł');
  });

  it('does not climb into the heading above', () => {
    expect(
      widen('## §2 Wdrożenie\nNowy pracownik dostaje laptop.', 'laptop'),
    ).toBe('Nowy pracownik dostaje laptop.');
  });

  it('takes a whole table row for a cell', () => {
    expect(
      widen('| Plan | Cena |\n|---|---|\n| Standard | 289 zł |', '289 zł'),
    ).toBe('| Standard | 289 zł |');
  });

  it('gives up rather than return more than the limit', () => {
    expect(
      widen(`Krótko: ${'a '.repeat(300)}koniec.`, 'koniec', 100),
    ).toBeNull();
  });
});
