import { describe, expect, it } from 'vitest';
import { alignClaimsToSources, missingQuoteFacts } from '../align-claims';
const sources = [
  { quote: '26 dni', span: 'Urlopy', fileName: 'hr.pdf' },
  { quote: '20 dni', span: '§2', fileName: 'hr.pdf' },
];
describe('alignClaimsToSources', () => {
  it('aligns markers in citation order without duplicating the evidence block', () => {
    const rows = alignClaimsToSources(
      '# Urlopy\n\nOpis.\n\n- Staż: 26 dni [2] [1]\n- Inna zasada [1]\n\n---\n1. 26 dni\n2. 20 dni',
      sources,
    );
    expect(rows.map((r) => r.claim)).toEqual(['Staż: 26 dni', 'Inna zasada']);
    expect(rows[0]?.citations.map((c) => c.source?.quote)).toEqual([
      '20 dni',
      '26 dni',
    ]);
  });
  it('keeps claims without markers and missing sources visible', () => {
    const rows = alignClaimsToSources(
      '- Bez dowodu\n- Nieznany [9]\n- Powtórzony [1] [1]',
      sources,
    );
    expect(rows[0]?.citations).toEqual([]);
    expect(rows[1]?.citations).toEqual([{ marker: 9, source: null }]);
    expect(rows[2]?.citations).toHaveLength(1);
  });
  it('supports wrapped list items and readable prose without inventing a citation', () => {
    expect(
      alignClaimsToSources(
        '- Długa reguła\n  ciąg dalszy [1]\n\nZwykły akapit.',
        sources,
      ).map((r) => r.claim),
    ).toEqual(['Długa reguła ciąg dalszy', 'Zwykły akapit.']);
  });
});
describe('missingQuoteFacts', () => {
  it('flags omitted numbers, dates, amounts and negation as heuristic facts', () => {
    expect(
      missingQuoteFacts(
        'Pracownik składa wniosek.',
        'Nie może przekroczyć 26 dni, do 30.09.2026, za 1 200,50 PLN.',
      ),
    ).toEqual(expect.arrayContaining(['nie', '26', '30.09.2026', '1 200,50']));
  });
  it('keeps equivalent numerical spelling and negation', () => {
    expect(
      missingQuoteFacts(
        'Nie więcej niż 1200.50 PLN i 26 dni.',
        'Nie więcej niż 1 200,50 PLN i 26 dni.',
      ),
    ).toEqual([]);
  });
  it('does not claim to detect arbitrary paraphrase errors', () => {
    expect(
      missingQuoteFacts(
        'Wniosek złożony po rozpoczęciu.',
        'Wniosek przed rozpoczęciem.',
      ),
    ).toEqual([]);
  });
});

it('flags a missing currency unit even when the numeric amount survives', () => {
  expect(missingQuoteFacts('100 miesięcznie', '100 EUR miesięcznie')).toContain(
    'EUR',
  );
});
