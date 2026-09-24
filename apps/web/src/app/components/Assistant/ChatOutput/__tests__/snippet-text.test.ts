import { describe, expect, it } from 'vitest';

import { snippetToPlainText } from '../snippet-text';

describe('snippetToPlainText', () => {
  // The three shapes from a real answer on the demo.
  it('reads a table row as its cells', () => {
    expect(
      snippetToPlainText(
        '| Refund | 14 days from acceptance | finance department | | Customer appeal against the decision | 14 days from service of the decision | Sales Director |',
      ),
    ).toBe(
      'Refund · 14 days from acceptance · finance department · Customer appeal against the decision · 14 days from service of the decision · Sales Director',
    );
  });

  it('drops heading marks, even mid-passage where a chunk flattened them', () => {
    expect(
      snippetToPlainText(
        '### How long do we have to assess a complaint? 14 calendar days from filing. ### Can we promise an electric pallet truck in two weeks? No.',
      ),
    ).toBe(
      'How long do we have to assess a complaint? 14 calendar days from filing. Can we promise an electric pallet truck in two weeks? No.',
    );
  });

  it('keeps the words of a document header', () => {
    expect(
      snippetToPlainText(
        '## Service Agreement - SLA terms Acme Industries sp. z o.o. ## 1. Subject and scope This agreement covers warranty.',
      ),
    ).toBe(
      'Service Agreement - SLA terms Acme Industries sp. z o.o. 1. Subject and scope This agreement covers warranty.',
    );
  });

  it('removes table separator rows', () => {
    expect(
      snippetToPlainText('| Month | Payday |\n|---|:---:|\n| Jan | 30.01 |'),
    ).toBe('Month · Payday · Jan · 30.01');
  });

  it('keeps the text of emphasis, links and inline code', () => {
    expect(
      snippetToPlainText(
        'Every employee gets **26 days**, see [the policy](https://x.example) and `HR-7`.',
      ),
    ).toBe('Every employee gets 26 days, see the policy and HR-7.');
  });

  it('drops list bullets', () => {
    expect(snippetToPlainText('- first point\n- second point')).toBe(
      'first point second point',
    );
  });

  it('leaves ordinary prose alone', () => {
    const prose =
      'Każdemu pracownikowi przysługuje 26 dni urlopu — także ze stażem krótszym niż 10 lat.';
    expect(snippetToPlainText(prose)).toBe(prose);
  });

  it('does not eat a hyphen, a hash or an asterisk inside words', () => {
    expect(snippetToPlainText('Ticket #42 costs 5*3 EUR on e-mail day')).toBe(
      'Ticket #42 costs 5*3 EUR on e-mail day',
    );
  });
});
