import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from '../format-relative-time';

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "now" or seconds for very recent dates', () => {
    const result = formatRelativeTime(new Date(), 'en');
    // Intl.RelativeTimeFormat returns "0 seconds ago" or "now" depending on locale
    expect(result).toBeTruthy();
  });

  it('returns minutes for dates within the last hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:30:00Z'));

    const thirtyMinsAgo = new Date('2026-03-25T12:00:00Z');
    const result = formatRelativeTime(thirtyMinsAgo, 'en');
    expect(result).toMatch(/30 minutes ago/);

    vi.useRealTimers();
  });

  it('returns hours for dates within the last day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T15:00:00Z'));

    const threeHoursAgo = new Date('2026-03-25T12:00:00Z');
    const result = formatRelativeTime(threeHoursAgo, 'en');
    expect(result).toMatch(/3 hours ago/);

    vi.useRealTimers();
  });

  it('returns days for dates within the last week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));

    const twoDaysAgo = new Date('2026-03-23T12:00:00Z');
    const result = formatRelativeTime(twoDaysAgo, 'en');
    expect(result).toMatch(/2 days ago/);

    vi.useRealTimers();
  });

  it('returns localized date string for dates older than a week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));

    const twoWeeksAgo = new Date('2026-03-10T12:00:00Z');
    const result = formatRelativeTime(twoWeeksAgo, 'en');
    // Should be a formatted date string (e.g., "3/10/2026")
    expect(result).toMatch(/\d/);
    expect(result).not.toMatch(/ago/);

    vi.useRealTimers();
  });

  it('accepts string dates', () => {
    const result = formatRelativeTime(new Date().toISOString(), 'en');
    expect(result).toBeTruthy();
  });

  it('works with Polish locale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));

    const oneHourAgo = new Date('2026-03-25T11:00:00Z');
    const result = formatRelativeTime(oneHourAgo, 'pl');
    // Polish: "1 godzinę temu" or similar
    expect(result).toBeTruthy();
    expect(result).toMatch(/temu|przed/i);

    vi.useRealTimers();
  });
});
