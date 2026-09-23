import { describe, expect, it } from 'vitest';

import {
  compatibilityFold,
  expandToSentence,
  QuoteIndex,
} from '../verify-quotes';

describe('QuoteIndex and superscripts', () => {
  const index = new QuoteIndex('Limit wynosi 10² jednostek. Woda to H₂O.');

  // NFKC would fold 10² into 102 and verify a different number.
  it('does not verify a quote whose number differs only by a superscript', () => {
    expect(index.contains('Limit wynosi 102 jednostek.')).toBe(false);
    expect(index.contains('Woda to H2O.')).toBe(false);
  });

  it('verifies the quote as the source writes it', () => {
    expect(index.contains('Limit wynosi 10² jednostek.')).toBe(true);
    expect(index.contains('woda to h₂o')).toBe(true);
  });

  it('keeps the superscript in a quote cut from the source', () => {
    const at = index.locate('10² jednostek')!;
    expect(expandToSentence(index.source, at, 400)).toBe(
      'Limit wynosi 10² jednostek.',
    );
  });
});

describe('compatibilityFold', () => {
  it('still folds ligatures, full-width forms and compatibility spaces', () => {
    expect(compatibilityFold('ﬁnanse ＡＢＣ')).toBe('finanse ABC');
  });

  it('still composes combining sequences around a kept superscript', () => {
    expect(compatibilityFold('é m² é')).toBe('é m² é');
  });
});
