import { describe, it, expect } from 'vitest';
import { currentPeriodAnchor } from '../period-anchor';

const iso = (d: Date) => d.toISOString();

describe('currentPeriodAnchor', () => {
  it('returns periodStart when now is before the start', () => {
    const start = new Date('2026-03-15T00:00:00Z');
    const now = new Date('2026-02-01T00:00:00Z');
    expect(iso(currentPeriodAnchor(start, now))).toBe(iso(start));
  });

  it('returns periodStart on the same day as start', () => {
    const start = new Date('2026-03-15T08:00:00Z');
    const now = new Date('2026-03-15T12:00:00Z');
    expect(iso(currentPeriodAnchor(start, now))).toBe(iso(start));
  });

  it('returns previous anchor when now is mid-period', () => {
    const start = new Date('2026-01-15T00:00:00Z');
    const now = new Date('2026-02-10T00:00:00Z'); // before Feb 15 boundary
    expect(iso(currentPeriodAnchor(start, now))).toBe(
      iso(new Date('2026-01-15T00:00:00Z')),
    );
  });

  it('rolls forward to the new anchor on the boundary day', () => {
    const start = new Date('2026-01-15T00:00:00Z');
    const now = new Date('2026-02-15T00:00:00Z');
    expect(iso(currentPeriodAnchor(start, now))).toBe(
      iso(new Date('2026-02-15T00:00:00Z')),
    );
  });

  it('clamps to month-end when subscription starts on day 31', () => {
    const start = new Date('2026-01-31T00:00:00Z');
    const now = new Date('2026-02-28T12:00:00Z');
    // Feb 2026 has 28 days → anchor clamps to Feb 28
    expect(iso(currentPeriodAnchor(start, now))).toBe(
      iso(new Date('2026-02-28T00:00:00Z')),
    );
  });

  it('handles year rollover', () => {
    const start = new Date('2025-12-15T00:00:00Z');
    const now = new Date('2026-01-20T00:00:00Z');
    expect(iso(currentPeriodAnchor(start, now))).toBe(
      iso(new Date('2026-01-15T00:00:00Z')),
    );
  });

  it('preserves the time-of-day from periodStart', () => {
    const start = new Date('2026-01-15T08:30:45.123Z');
    const now = new Date('2026-03-20T00:00:00Z');
    expect(iso(currentPeriodAnchor(start, now))).toBe(
      iso(new Date('2026-03-15T08:30:45.123Z')),
    );
  });
});
