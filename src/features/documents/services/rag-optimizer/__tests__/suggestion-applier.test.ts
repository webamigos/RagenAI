import { describe, it, expect } from 'vitest';
import { applySuggestions } from '../suggestion-applier';
import type { OptimizationSuggestion } from '@/features/documents/contracts/optimization-suggestion.types';

const makeSuggestion = (
  overrides: Partial<OptimizationSuggestion> = {},
): OptimizationSuggestion => ({
  id: 'sug-1',
  type: 'terminology',
  location: 'Section 1',
  before: 'old text',
  after: 'new text',
  rationale: 'Better',
  expectedScoreDelta: 5,
  ...overrides,
});

describe('applySuggestions', () => {
  it('replaces matching before text with after text', () => {
    const content = 'This is old text in the document.';
    const suggestions = [
      makeSuggestion({ before: 'old text', after: 'new text' }),
    ];
    const result = applySuggestions(content, suggestions);
    expect(result).toBe('This is new text in the document.');
  });

  it('applies multiple suggestions in order', () => {
    const content = 'foo bar baz';
    const suggestions = [
      makeSuggestion({ id: 'a', before: 'foo', after: 'FOO' }),
      makeSuggestion({ id: 'b', before: 'bar', after: 'BAR' }),
    ];
    const result = applySuggestions(content, suggestions);
    expect(result).toBe('FOO BAR baz');
  });

  it('returns original content when no suggestions match', () => {
    const content = 'unchanged content';
    const result = applySuggestions(content, [
      makeSuggestion({ before: 'not found' }),
    ]);
    expect(result).toBe('unchanged content');
  });

  it('returns original content for empty suggestions array', () => {
    const content = 'original';
    expect(applySuggestions(content, [])).toBe('original');
  });
});
