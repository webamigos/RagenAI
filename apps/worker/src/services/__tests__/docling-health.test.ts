import { describe, expect, it, vi } from 'vitest';

vi.mock('../docling-client.js', () => ({ isDoclingAvailable: vi.fn() }));

const { cachedDoclingHealth } = await import('../docling-health.js');

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('cachedDoclingHealth', () => {
  it('answers from the cache until it is ttlMs old', async () => {
    const c = clock();
    const check = vi.fn(async () => true);
    const isUp = cachedDoclingHealth({ check, ttlMs: 5_000, now: c.now });

    await isUp();
    c.advance(4_999);
    await isUp();
    expect(check).toHaveBeenCalledTimes(1);

    c.advance(1);
    await isUp();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('remembers down as long as up, so a failing Docling is not probed harder', async () => {
    const c = clock();
    const check = vi.fn(async () => false);
    const isUp = cachedDoclingHealth({ check, now: c.now });

    expect(await isUp()).toBe(false);
    expect(await isUp()).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent askers', async () => {
    let resolve!: (up: boolean) => void;
    const check = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const isUp = cachedDoclingHealth({ check });

    const answers = Promise.all([isUp(), isUp(), isUp()]);
    resolve(true);
    expect(await answers).toEqual([true, true, true]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('treats a check that throws as down', async () => {
    const isUp = cachedDoclingHealth({
      check: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(await isUp()).toBe(false);
  });
});
