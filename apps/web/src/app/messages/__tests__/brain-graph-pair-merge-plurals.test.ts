import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../en.json';
import pl from '../pl.json';

const translate = (locale: string, messages: object) =>
  createTranslator({ locale, messages, namespace: 'brain.graph' } as never);

describe('the graph pair-merge notice', () => {
  it.each([
    [1, '1 page to review may match a page drawn from the other language'],
    [3, '3 pages to review may match a page drawn from the other language'],
  ])('English, %i', (count, start) => {
    expect(translate('en', en)('pair-merge', { count })).toContain(start);
  });

  it.each([
    [1, '1 strona do sprawdzenia może pasować'],
    [3, '3 strony do sprawdzenia mogą pasować'],
    [5, '5 stron do sprawdzenia może pasować'],
  ])('Polish, %i', (count, start) => {
    expect(translate('pl', pl)('pair-merge', { count })).toContain(start);
  });

  it('never says the candidates come from one document', () => {
    expect(en.brain.graph['pair-merge']).not.toMatch(/same document/);
    expect(pl.brain.graph['pair-merge']).not.toMatch(/tego samego dokumentu/);
  });
});
