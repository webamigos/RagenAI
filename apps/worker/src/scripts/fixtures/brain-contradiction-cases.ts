/**
 * Labelled page pairs for `brain-contradiction-eval.ts` (spec C1).
 *
 * Written for the measurement, not taken from a customer: each pair is two
 * pages on one subject as extraction would produce them, their passages
 * verbatim. `expected` lists the contradicting passages as 1-based
 * `[a, b]` numbers; an empty list is a pair that must come back clean.
 *
 * The negatives are the traps the judge's prompt names — a paraphrase, the
 * same quantity in other units, an explicitly different scope, one side more
 * detailed, a translation, a stated change over time, different facts about
 * one subject — because a judge that reports those buries the real ones.
 */
export type ContradictionCase = {
  name: string;
  /** Of the passages, as ingest would detect it; null for a mixed pair. */
  language: 'pl' | 'en' | null;
  a: string[];
  b: string[];
  expected: [number, number][];
};

export const CONTRADICTION_CASES: ContradictionCase[] = [
  // Positives.
  {
    name: 'pl-vacation-days',
    language: 'pl',
    a: [
      'Pracownikowi zatrudnionemu na pełen etat przysługuje 26 dni urlopu wypoczynkowego w roku kalendarzowym.',
    ],
    b: [
      'Pracownikowi zatrudnionemu na pełen etat przysługuje 20 dni urlopu wypoczynkowego w roku kalendarzowym.',
    ],
    expected: [[1, 1]],
  },
  {
    name: 'pl-refund-deadline',
    language: 'pl',
    a: [
      'Zwrot należności następuje w terminie 14 dni od dnia złożenia reklamacji.',
    ],
    b: [
      'Zwrot należności następuje w terminie 30 dni od dnia złożenia reklamacji.',
    ],
    expected: [[1, 1]],
  },
  {
    name: 'pl-approver',
    language: 'pl',
    a: ['Wniosek urlopowy zatwierdza bezpośredni przełożony pracownika.'],
    b: [
      'Wniosek urlopowy zatwierdza wyłącznie dział kadr, bez udziału przełożonego.',
    ],
    expected: [[1, 1]],
  },
  {
    name: 'pl-remote-work',
    language: 'pl',
    a: [
      'Pracownik może pracować zdalnie do dwóch dni w tygodniu po uzgodnieniu z przełożonym.',
    ],
    b: [
      'Praca zdalna nie jest w spółce dopuszczalna; wszyscy pracownicy wykonują pracę w biurze.',
    ],
    expected: [[1, 1]],
  },
  {
    name: 'pl-plan-price',
    language: 'pl',
    a: ['Abonament Standard kosztuje 49 zł miesięcznie.'],
    b: ['Opłata za abonament Standard wynosi 59 zł miesięcznie.'],
    expected: [[1, 1]],
  },
  {
    name: 'en-notice-period',
    language: 'en',
    a: [
      'Either party may terminate the agreement with one month’s written notice.',
    ],
    b: [
      'The agreement may be terminated by either party with three months’ written notice.',
    ],
    expected: [[1, 1]],
  },
  {
    name: 'pl-invoice-date-implicit',
    language: 'pl',
    a: [
      'Faktury za dany miesiąc wystawiane są do 5. dnia następnego miesiąca.',
    ],
    b: ['Faktury wystawiane są w ostatnim dniu miesiąca, którego dotyczą.'],
    expected: [[1, 1]],
  },
  {
    name: 'pl-one-of-many',
    language: 'pl',
    a: [
      'Delegację zgłasza się w systemie kadrowym najpóźniej 3 dni przed wyjazdem.',
      'Dieta krajowa wynosi 45 zł za dobę.',
      'Koszty noclegu rozlicza się na podstawie faktury.',
      'Zaliczkę na podróż wypłaca dział księgowości.',
    ],
    b: [
      'Koszty noclegu są zwracane po przedstawieniu faktury.',
      'Dieta krajowa wynosi 38 zł za dobę podróży.',
      'Delegację zatwierdza przełożony.',
    ],
    expected: [[2, 2]],
  },
  // Negatives.
  {
    name: 'pl-paraphrase',
    language: 'pl',
    a: ['Pracownikowi przysługuje 26 dni urlopu wypoczynkowego w roku.'],
    b: ['Roczny wymiar urlopu wypoczynkowego pracownika wynosi 26 dni.'],
    expected: [],
  },
  {
    name: 'pl-units',
    language: 'pl',
    a: ['Reklamację rozpatruje się w ciągu 14 dni od jej otrzymania.'],
    b: [
      'Na rozpatrzenie reklamacji sprzedawca ma dwa tygodnie od jej otrzymania.',
    ],
    expected: [],
  },
  {
    name: 'pl-explicit-scope',
    language: 'pl',
    a: [
      'Pracownikom zatrudnionym na umowę o pracę przysługuje 26 dni urlopu wypoczynkowego.',
    ],
    b: [
      'Współpracownikom na kontraktach B2B przysługuje 20 dni przerwy w świadczeniu usług.',
    ],
    expected: [],
  },
  {
    name: 'pl-more-detail',
    language: 'pl',
    a: ['Wniosek urlopowy składa się w systemie HR.'],
    b: [
      'Wniosek urlopowy składa się w systemie HR co najmniej 7 dni przed planowanym urlopem.',
    ],
    expected: [],
  },
  {
    name: 'en-pl-translation',
    language: null,
    a: ['The refund is paid to the customer within 14 days of the return.'],
    b: ['Zwrot pieniędzy następuje w ciągu 14 dni od dokonania zwrotu towaru.'],
    expected: [],
  },
  {
    name: 'pl-stated-change',
    language: 'pl',
    a: [
      'Od 1 stycznia 2026 r. opłata za abonament Standard wynosi 59 zł miesięcznie.',
    ],
    b: [
      'Do 31 grudnia 2025 r. opłata za abonament Standard wynosiła 49 zł miesięcznie.',
    ],
    expected: [],
  },
  {
    name: 'pl-different-facts',
    language: 'pl',
    a: [
      'Biuro obsługi klienta jest czynne od poniedziałku do piątku w godzinach 8–16.',
    ],
    b: ['Biuro obsługi klienta mieści się przy ul. Długiej 5 w Gdańsku.'],
    expected: [],
  },
];
