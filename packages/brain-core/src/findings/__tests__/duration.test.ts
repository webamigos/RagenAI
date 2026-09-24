import { describe, expect, it } from 'vitest';

import { addIsoDuration } from '../duration';

const at = (iso: string) => new Date(iso);

describe('addIsoDuration', () => {
  it('adds calendar months, clamping to the end of a shorter month', () => {
    expect(addIsoDuration(at('2026-01-31T10:00:00Z'), 'P1M')).toEqual(
      at('2026-02-28T10:00:00Z'),
    );
  });

  it('carries months over a year boundary', () => {
    expect(addIsoDuration(at('2026-11-15T00:00:00Z'), 'P3M')).toEqual(
      at('2027-02-15T00:00:00Z'),
    );
  });

  it('adds a leap year to 29 February as 28 February', () => {
    expect(addIsoDuration(at('2028-02-29T00:00:00Z'), 'P1Y')).toEqual(
      at('2029-02-28T00:00:00Z'),
    );
  });

  it('adds weeks, days and a time part as fixed lengths', () => {
    expect(addIsoDuration(at('2026-09-01T00:00:00Z'), 'P2W1DT12H30M')).toEqual(
      at('2026-09-16T12:30:00Z'),
    );
  });

  it.each(['', 'P', 'PT', '3M', 'P1.5M', 'monthly', 'P-1M'])(
    'refuses %j rather than inventing a date',
    (value) => {
      expect(addIsoDuration(at('2026-09-01T00:00:00Z'), value)).toBeNull();
    },
  );
});
