import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const read = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ getThreadMemoryChangesAction: read }));

import {
  MEMORY_LINE_FRESH_MS,
  MEMORY_LINE_POLL_DELAYS_MS,
  useThreadMemoryChanges,
} from '../useThreadMemoryChanges';

const LINE = [
  { publicId: 'c1', operation: 'ADD', content: 'x', state: 'undoable' },
];

/** Let one scheduled read fire and its promise settle. */
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  read.mockReset();
  read.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useThreadMemoryChanges', () => {
  it('reads nothing without a thread — a public or read-only surface', async () => {
    renderHook(() => useThreadMemoryChanges(undefined, undefined));
    await advance(60_000);
    expect(read).not.toHaveBeenCalled();
  });

  it('reads an old thread once', async () => {
    const old = {
      id: 'm1',
      createdAt: new Date(Date.now() - MEMORY_LINE_FRESH_MS - 1),
    };
    renderHook(() => useThreadMemoryChanges('t1', old));
    await advance(60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('t1');
  });

  it('keeps reading after a fresh answer until its line appears', async () => {
    read.mockResolvedValueOnce({}).mockResolvedValueOnce({ m2: LINE });
    // One object, as a saved message is: its timestamp does not move.
    const fresh = { id: 'm2', createdAt: new Date() };
    const { result } = renderHook(() => useThreadMemoryChanges('t1', fresh));

    await advance(0);
    expect(read).toHaveBeenCalledTimes(1);
    await advance(MEMORY_LINE_POLL_DELAYS_MS[1]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.changes).toEqual({ m2: LINE });

    // Found: no further reads.
    await advance(60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last delay when the turn changed nothing', async () => {
    const fresh = { id: 'm2', createdAt: new Date() };
    renderHook(() => useThreadMemoryChanges('t1', fresh));
    await advance(120_000);
    expect(read).toHaveBeenCalledTimes(MEMORY_LINE_POLL_DELAYS_MS.length);
  });

  it('drops a refresh that resolves after the reader moved to another thread', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    const old = { id: 'm1', createdAt: new Date(0) };
    const { result, rerender } = renderHook(
      ({ thread }) => useThreadMemoryChanges(thread, old),
      { initialProps: { thread: 't1' } },
    );
    await advance(0);

    read.mockImplementationOnce(
      () => new Promise((resolve) => (resolveOld = resolve)),
    );
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.refresh();
    });

    read.mockResolvedValue({ m9: LINE });
    rerender({ thread: 't2' });
    await advance(0);
    expect(result.current.changes).toEqual({ m9: LINE });

    await act(async () => {
      resolveOld({ m1: LINE });
      await pending;
    });
    expect(result.current.changes).toEqual({ m9: LINE });
  });
});
