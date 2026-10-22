import { describe, expect, it } from 'vitest';

import {
  THREAD_RETENTION_DAYS_OPTIONS,
  isThreadRetentionDays,
  isThreadRetentionTightening,
  threadRetentionCutoff,
} from '../retention/thread-retention';

describe('thread retention presets', () => {
  it('offers the four periods the panel shows, shortest first', () => {
    expect(THREAD_RETENTION_DAYS_OPTIONS).toEqual([30, 90, 180, 365]);
  });

  it.each([30, 90, 180, 365])('accepts %i', (days) => {
    expect(isThreadRetentionDays(days)).toBe(true);
  });

  // `null` is "off", which is not a period; the rest are values a stale or
  // hand-edited row could hold and the worker must not act on.
  it.each([null, undefined, 0, 1, 3, 29, 31, 364, -30, 30.5, '30', NaN])(
    'refuses %s',
    (value) => {
      expect(isThreadRetentionDays(value)).toBe(false);
    },
  );
});

describe('threadRetentionCutoff', () => {
  it('is exactly the period before now, in 24-hour days', () => {
    const now = new Date('2026-10-19T03:45:00.000Z');

    expect(threadRetentionCutoff(30, now).toISOString()).toBe(
      '2026-09-19T03:45:00.000Z',
    );
    expect(threadRetentionCutoff(365, now).toISOString()).toBe(
      '2025-10-19T03:45:00.000Z',
    );
  });
});

describe('isThreadRetentionTightening', () => {
  it.each([
    [null, 30, true],
    [null, 365, true],
    [365, 30, true],
    [90, 30, true],
    [30, 90, false],
    [30, 30, false],
    [30, null, false],
    [null, null, false],
  ] as const)('%s -> %s is %s', (current, next, expected) => {
    expect(isThreadRetentionTightening(current, next)).toBe(expected);
  });
});
