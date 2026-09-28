import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/db/index.js', () => ({
  db: { isIngestCancelled: vi.fn() },
}));
vi.mock('../../../services/docling-health.js', () => ({
  isDoclingUp: vi.fn(),
}));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { waitForDoclingWith } = await import('../wait-for-docling.js');

/** A fake clock that `sleep` moves, so no test waits for real. */
function harness(upAfter: number | null, cancelAfter: number | null = null) {
  let t = 0;
  const sleeps: number[] = [];
  let looks = 0;
  const deps = {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    }),
    isUp: vi.fn(async () => upAfter !== null && looks++ >= upAfter),
    isCancelled: vi.fn(
      async () => cancelAfter !== null && sleeps.length >= cancelAfter,
    ),
    maxWaitMs: 5 * 60_000,
  };
  return { deps, sleeps };
}

describe('waitForDoclingWith (spec B1)', () => {
  it('returns at once when Docling is up, without sleeping', async () => {
    const { deps, sleeps } = harness(0);
    await expect(waitForDoclingWith(deps)).resolves.toEqual({
      outcome: 'available',
      waitedMs: 0,
    });
    expect(sleeps).toEqual([]);
  });

  it('waits out a restart, backing off, and reports how long it took', async () => {
    const { deps, sleeps } = harness(2);
    await expect(waitForDoclingWith(deps)).resolves.toEqual({
      outcome: 'available',
      waitedMs: 15_000,
    });
    expect(sleeps).toEqual([5_000, 10_000]);
  });

  it('stops when the ingest is cancelled', async () => {
    const { deps } = harness(null, 1);
    await expect(waitForDoclingWith(deps)).resolves.toMatchObject({
      outcome: 'cancelled',
    });
  });

  it('gives up at the limit, exactly, and says since when', async () => {
    const { deps, sleeps } = harness(null);
    const result = await waitForDoclingWith(deps);
    expect(result).toEqual({
      outcome: 'timed-out',
      waitedMs: 5 * 60_000,
      since: new Date(0).toISOString(),
    });
    // The last pause is cut to the limit rather than overshooting it.
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(5 * 60_000);
  });
});
