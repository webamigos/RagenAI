import { describe, expect, it, vi } from 'vitest';

vi.mock('../docling-client.js', () => ({ isDoclingAvailable: vi.fn() }));

const { createDoclingStatusProbe } =
  await import('../docling-status-publisher.js');

/** Answers in order, repeating the last. */
function answers(...ups: boolean[]) {
  let i = 0;
  return vi.fn(async () => ups[Math.min(i++, ups.length - 1)]);
}

function clock() {
  let t = Date.parse('2026-09-28T09:00:00.000Z');
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function setup(check: () => Promise<boolean>) {
  const c = clock();
  const log = { info: vi.fn(), error: vi.fn() };
  const write = vi.fn(async (_value: string, _ttl: number) => undefined);
  const probe = createDoclingStatusProbe({ check, write, log, now: c.now });
  return { probe, log, write, c };
}

describe('createDoclingStatusProbe (spec C1)', () => {
  it('publishes each probe with an expiry', async () => {
    const { probe, write } = setup(answers(true));

    await probe();

    expect(write).toHaveBeenCalledWith(
      JSON.stringify({
        up: true,
        since: '2026-09-28T09:00:00.000Z',
        checkedAt: '2026-09-28T09:00:00.000Z',
      }),
      90,
    );
  });

  it('logs nothing while Docling stays up, including at boot', async () => {
    const { probe, log } = setup(answers(true));
    await probe();
    await probe();
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  // One line per change, so an hour's outage is two lines, not 120.
  it('logs one error going down and one info coming back', async () => {
    const { probe, log, c } = setup(answers(true, false, false, false, true));
    for (let i = 0; i < 5; i++) {
      await probe();
      c.advance(30_000);
    }
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0][0]).toEqual({
      docling: 'up',
      downSince: '2026-09-28T09:00:30.000Z',
    });
  });

  it('logs at boot when Docling is already down', async () => {
    const { probe, log } = setup(answers(false));
    await probe();
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('keeps `since` at the last change, not the last probe', async () => {
    const { probe, c } = setup(answers(true, false, false));
    await probe();
    c.advance(30_000);
    const wentDown = await probe();
    c.advance(30_000);
    const stillDown = await probe();
    expect(wentDown.since).toBe('2026-09-28T09:00:30.000Z');
    expect(stillDown.since).toBe('2026-09-28T09:00:30.000Z');
    expect(stillDown.checkedAt).toBe('2026-09-28T09:01:00.000Z');
  });

  it('treats a check that throws as down, and survives a failed write', async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const probe = createDoclingStatusProbe({
      check: async () => {
        throw new Error('ECONNREFUSED');
      },
      write: async () => {
        throw new Error('redis down');
      },
      log,
    });
    await expect(probe()).resolves.toMatchObject({ up: false });
  });
});
