import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  isIngestCancelled: vi.fn(async () => false),
  mergeFileMetadata: vi.fn(
    async (_args: {
      where: { fileId: string; orgId: string };
      patch: Record<string, unknown>;
    }) => 1,
  ),
}));
const isDoclingUp = vi.hoisted(() => vi.fn(async () => true));

vi.mock('../../../services/db/index.js', () => ({ db }));
vi.mock('../../../services/docling-health.js', () => ({ isDoclingUp }));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { waitForDocling, waitForDoclingWith } =
  await import('../wait-for-docling.js');

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

describe('waitForDoclingWith — onWaiting', () => {
  it('reports the wait once, with when it began, and not at all when Docling is up', async () => {
    const up = harness(0);
    const onUp = vi.fn(async () => undefined);
    await waitForDoclingWith({ ...up.deps, onWaiting: onUp });
    expect(onUp).not.toHaveBeenCalled();

    const down = harness(3);
    const onDown = vi.fn(async () => undefined);
    await waitForDoclingWith({ ...down.deps, onWaiting: onDown });
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown).toHaveBeenCalledWith(new Date(0).toISOString());
  });
});

// Spec B2: the reason is on the row while the file waits, and gone after.
describe('waitForDocling — the reason on the row', () => {
  it('writes nothing when Docling is up', async () => {
    db.mergeFileMetadata.mockClear();
    isDoclingUp.mockResolvedValue(true);

    await waitForDocling({ fileId: 'file-1', orgId: 'org-1' });

    expect(db.mergeFileMetadata).not.toHaveBeenCalled();
  });

  it('records what the file waits for, then clears it when the wait ends', async () => {
    vi.useFakeTimers();
    try {
      db.mergeFileMetadata.mockClear();
      isDoclingUp.mockResolvedValueOnce(false).mockResolvedValue(true);

      const done = waitForDocling({ fileId: 'file-1', orgId: 'org-1' });
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(done).resolves.toMatchObject({ outcome: 'available' });

      const patches = db.mergeFileMetadata.mock.calls.map(([arg]) => arg.patch);
      expect(patches).toEqual([
        { waitingFor: { parser: 'docling', since: expect.any(String) } },
        { waitingFor: null },
      ]);
      expect(db.mergeFileMetadata.mock.calls[0][0]).toMatchObject({
        where: { fileId: 'file-1', orgId: 'org-1' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting when the reason cannot be written', async () => {
    vi.useFakeTimers();
    try {
      db.mergeFileMetadata.mockRejectedValue(new Error('db down'));
      isDoclingUp.mockResolvedValueOnce(false).mockResolvedValue(true);

      const done = waitForDocling({ fileId: 'file-1', orgId: 'org-1' });
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(done).resolves.toMatchObject({ outcome: 'available' });
    } finally {
      vi.useRealTimers();
      db.mergeFileMetadata.mockResolvedValue(1);
    }
  });
});
