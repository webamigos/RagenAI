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

/**
 * One failed look is not an outage. The first probe runs while the worker is
 * still importing its modules, and a blocked event loop let the 5 s health
 * timeout fire on a healthy Docling: "Docling is unavailable" at boot, and
 * "down" published for the setup page, on 2 of 5 local starts.
 */
describe('createDoclingStatusProbe — confirming an outage', () => {
  function confirming(check: () => Promise<boolean>) {
    const log = { info: vi.fn(), error: vi.fn() };
    const write = vi.fn(async (_value: string, _ttl: number) => undefined);
    const sleep = vi.fn(async (_ms: number) => undefined);
    const probe = createDoclingStatusProbe({
      check,
      write,
      log,
      confirmDown: { delayMs: 5_000, sleep },
    });
    return { probe, log, write, sleep, check };
  }

  it('does not call Docling down at boot when a second look finds it up', async () => {
    const { probe, log, write, sleep, check } = confirming(
      answers(false, true),
    );

    await expect(probe()).resolves.toMatchObject({ up: true });

    expect(check).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5_000);
    expect(log.error).not.toHaveBeenCalled();
    expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({ up: true });
  });

  it('reports an outage that the second look confirms, on the same probe', async () => {
    const { probe, log } = confirming(answers(false, false));

    await expect(probe()).resolves.toMatchObject({ up: false });

    expect(log.error).toHaveBeenCalledWith(
      { docling: 'down' },
      'Docling is unavailable',
    );
  });

  it('looks once when Docling is up', async () => {
    const { probe, sleep, check } = confirming(answers(true));

    await probe();

    expect(check).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not log a blip between two healthy probes', async () => {
    const { probe, log } = confirming(answers(true, false, true, true));

    await probe();
    await probe();
    await probe();

    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });
});
