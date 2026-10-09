import { createTranslator } from 'next-intl';
import { expect, it } from 'vitest';
import pl from '@/app/messages/pl.json';

const t = createTranslator({
  locale: 'pl',
  messages: pl,
  namespace: 'brain.documents',
});

it.each([
  [0, '0 zatwierdzonych · 0 do sprawdzenia'],
  [1, '1 zatwierdzona · 1 do sprawdzenia'],
  [2, '2 zatwierdzone · 2 do sprawdzenia'],
  [5, '5 zatwierdzonych · 5 do sprawdzenia'],
  [12, '12 zatwierdzonych · 12 do sprawdzenia'],
  [22, '22 zatwierdzone · 22 do sprawdzenia'],
])(
  'inflects the approved count and states the count to review for %i',
  (count, expected) => {
    expect(t('coverage-counts', { approved: count, candidates: count })).toBe(
      expected,
    );
  },
);
