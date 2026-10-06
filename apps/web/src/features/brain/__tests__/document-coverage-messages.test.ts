import { createTranslator } from 'next-intl';
import { expect, it } from 'vitest';
import pl from '@/app/messages/pl.json';

const t = createTranslator({
  locale: 'pl',
  messages: pl,
  namespace: 'brain.documents',
});

it.each([
  [0, '0 zatwierdzonych · 0 kandydatów'],
  [1, '1 zatwierdzona · 1 kandydat'],
  [2, '2 zatwierdzone · 2 kandydaci'],
  [5, '5 zatwierdzonych · 5 kandydatów'],
  [12, '12 zatwierdzonych · 12 kandydatów'],
  [22, '22 zatwierdzone · 22 kandydaci'],
])('inflects both document coverage counts for %i', (count, expected) => {
  expect(t('coverage-counts', { approved: count, candidates: count })).toBe(
    expected,
  );
});
