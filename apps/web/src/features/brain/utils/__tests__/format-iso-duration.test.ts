import { describe, expect, it } from 'vitest';

import { formatIsoDuration } from '../format-iso-duration';

describe('formatIsoDuration', () => {
  it('says a six-month interval in words, in each language', () => {
    expect(formatIsoDuration('P6M', 'en')).toBe('6 months');
    expect(formatIsoDuration('P6M', 'pl')).toBe('6 miesięcy');
  });

  it('applies the language’s plural rules', () => {
    expect(formatIsoDuration('P1M', 'pl')).toBe('1 miesiąc');
    expect(formatIsoDuration('P2M', 'pl')).toBe('2 miesiące');
    expect(formatIsoDuration('P1Y', 'en')).toBe('1 year');
  });

  it('joins several parts', () => {
    const text = formatIsoDuration('P1Y2M', 'en');
    expect(text).toContain('1 year');
    expect(text).toContain('2 months');
  });

  it('reads weeks, days and the time part', () => {
    expect(formatIsoDuration('P2W', 'en')).toBe('2 weeks');
    expect(formatIsoDuration('PT12H', 'en')).toBe('12 hours');
  });

  it('never prints the raw ISO code for a valid duration', () => {
    expect(formatIsoDuration('P6M', 'de')).not.toMatch(/P6M/);
  });

  it('returns anything it cannot read unchanged', () => {
    expect(formatIsoDuration('every spring', 'en')).toBe('every spring');
    expect(formatIsoDuration('P0D', 'en')).toBe('P0D');
  });
});
