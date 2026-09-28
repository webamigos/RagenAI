import { describe, expect, it } from 'vitest';

import {
  DOCLING_GATE_STEP_TIMEOUT,
  DOCLING_GATE_STEP_TIMEOUT_MS,
  DOCLING_OUTAGE_MAX_WAIT_MS,
  doclingGateDelayMs,
} from '../docling-gate.js';

describe('the Docling gate policy (spec B1)', () => {
  it('looks after 5 s, then doubles, then every minute', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(doclingGateDelayMs)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ]);
  });

  // The step would be killed mid-wait otherwise, and the file would fail as
  // a timeout of the step rather than with "parser unavailable since …".
  it('gives the waiting step longer than the wait itself', () => {
    expect(DOCLING_GATE_STEP_TIMEOUT_MS).toBeGreaterThan(
      DOCLING_OUTAGE_MAX_WAIT_MS + 60_000,
    );
    expect(DOCLING_GATE_STEP_TIMEOUT).toBe(
      `${DOCLING_GATE_STEP_TIMEOUT_MS / 60_000} minutes`,
    );
  });
});
