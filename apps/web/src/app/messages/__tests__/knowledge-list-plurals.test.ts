import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import pl from '../pl.json';

const t = createTranslator({
  locale: 'pl',
  messages: pl,
  namespace: 'knowledge-list',
});

describe('Polish knowledge-list counts', () => {
  it.each([
    [1, '1 plik z tabelami bez nagłówków'],
    [3, '3 pliki z tabelami bez nagłówków'],
    [5, '5 plików z tabelami bez nagłówków'],
  ])('headerless-count %i', (count, expected) => {
    expect(t('headerless-count', { count })).toBe(expected);
  });

  it.each([
    [1, '1 plik gotowy, ale bez wiedzy'],
    [2, '2 pliki gotowe, ale bez wiedzy'],
    [7, '7 plików gotowych, ale bez wiedzy'],
  ])('empty-count %i', (count, expected) => {
    expect(t('empty-count', { count })).toBe(expected);
  });
});
