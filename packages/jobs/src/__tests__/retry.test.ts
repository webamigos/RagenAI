import { describe, expect, it } from 'vitest';

import { backoffMs, durationMs } from '../retry';

describe('durationMs', () => {
  it('reads the duration strings the policies actually use', () => {
    expect(durationMs('1 second')).toBe(1_000);
    expect(durationMs('30 seconds')).toBe(30_000);
    expect(durationMs('1 minute')).toBe(60_000);
    expect(durationMs('2 minutes')).toBe(120_000);
    expect(durationMs('5 minutes')).toBe(300_000);
    expect(durationMs('10 minutes')).toBe(600_000);
  });

  it('throws on a string it cannot read, rather than defaulting', () => {
    // A silent fallback would apply a timeout nobody chose, to a policy that
    // is a constant in this repository — so the typo has to surface.
    expect(() => durationMs('soon')).toThrow(/unreadable duration/);
    expect(() => durationMs('5 parsecs')).toThrow(/unreadable duration/);
    expect(() => durationMs('')).toThrow(/unreadable duration/);
  });
});

describe('backoffMs', () => {
  const ingest = {
    initialInterval: '1 second',
    maximumInterval: '1 minute',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  };

  it('grows exponentially from the initial interval', () => {
    expect(backoffMs(ingest, 1)).toBe(1_000);
    expect(backoffMs(ingest, 2)).toBe(2_000);
    expect(backoffMs(ingest, 3)).toBe(4_000);
    expect(backoffMs(ingest, 4)).toBe(8_000);
  });

  it('caps at the maximum interval', () => {
    // The ingest policy would reach 64s on its seventh attempt; Temporal caps
    // it at a minute, so the BullMQ wrapper has to as well or the two engines
    // wait different amounts for the same configuration.
    expect(backoffMs(ingest, 7)).toBe(60_000);
    expect(backoffMs(ingest, 99)).toBe(60_000);
  });

  it('applies the PII policy exactly as configured', () => {
    // 5s → 30s → 2min in the worker's own words: coefficient 6, capped.
    const pii = {
      initialInterval: '5 seconds',
      maximumInterval: '2 minutes',
      backoffCoefficient: 6,
      maximumAttempts: 3,
    };

    expect(backoffMs(pii, 1)).toBe(5_000);
    expect(backoffMs(pii, 2)).toBe(30_000);
    expect(backoffMs(pii, 3)).toBe(120_000);
  });
});
