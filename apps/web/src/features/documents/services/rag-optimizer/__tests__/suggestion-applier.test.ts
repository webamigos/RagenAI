import { describe, it, expect } from 'vitest';

import { applySuggestions } from '../suggestion-applier';
import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

const suggestion = (
  overrides: Partial<OptimizationSuggestion>,
): OptimizationSuggestion =>
  ({
    id: 's1',
    type: 'terminology',
    location: 'section 1',
    before: '',
    after: '',
    rationale: 'because',
    dimensions: {},
    ...overrides,
  }) as OptimizationSuggestion;

describe('applySuggestions', () => {
  it('substitutes the proposed text and reports it applied', () => {
    const outcome = applySuggestions('The pracownik signed.', [
      suggestion({ before: 'pracownik', after: 'zatrudniony' }),
    ]);

    expect(outcome.content).toBe('The zatrudniony signed.');
    expect(outcome.results).toEqual([{ id: 's1', applied: true }]);
  });

  it('treats $ sequences in the replacement as literal text', () => {
    // String.replace reads $&, $`, $' and $1 in a *string* replacement as
    // substitution patterns. `after` is model-generated prose that can contain
    // a dollar sign, and the document would gain text nobody proposed.
    const outcome = applySuggestions('Fee: TBD.', [
      suggestion({ before: 'TBD', after: '$5,000 (see $& clause)' }),
    ]);

    expect(outcome.content).toBe('Fee: $5,000 (see $& clause).');
  });

  it('reports a suggestion whose text is no longer present', () => {
    const outcome = applySuggestions('Untouched document.', [
      suggestion({ id: 'missing', before: 'not here', after: 'replacement' }),
    ]);

    expect(outcome.content).toBe('Untouched document.');
    expect(outcome.results).toEqual([{ id: 'missing', applied: false }]);
  });

  it('reports the later of two overlapping suggestions as not applied', () => {
    // Applied in sequence, so the first can consume the text the second was
    // written against. Claiming both landed would be a lie the user acts on.
    const outcome = applySuggestions('alpha beta gamma', [
      suggestion({ id: 'first', before: 'alpha beta', after: 'ALPHA' }),
      suggestion({ id: 'second', before: 'beta gamma', after: 'GAMMA' }),
    ]);

    expect(outcome.content).toBe('ALPHA gamma');
    expect(outcome.results).toEqual([
      { id: 'first', applied: true },
      { id: 'second', applied: false },
    ]);
  });

  it('skips suggestions with an empty side', () => {
    const outcome = applySuggestions('unchanged', [
      suggestion({ id: 'a', before: '', after: 'x' }),
      suggestion({ id: 'b', before: 'unchanged', after: '' }),
    ]);

    expect(outcome.content).toBe('unchanged');
    expect(outcome.results.every((r) => !r.applied)).toBe(true);
  });

  it('replaces only the first occurrence', () => {
    // One suggestion is one atomic change; replacing every occurrence would
    // silently rewrite text the model never looked at.
    const outcome = applySuggestions('repeat repeat repeat', [
      suggestion({ before: 'repeat', after: 'once' }),
    ]);

    expect(outcome.content).toBe('once repeat repeat');
  });
});
