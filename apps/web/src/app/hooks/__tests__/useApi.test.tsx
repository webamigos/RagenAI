import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApi } from '../useApi';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(cleanup);

describe('useApi', () => {
  it('preserves the original rejection and returns to pending on refetch', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const failure = new Error('request failed');
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useApi<string>(fetcher));
    await act(async () => {
      first.reject(failure);
    });
    expect(result.current).toMatchObject({
      isError: true,
      error: failure,
      data: undefined,
    });
    act(() => {
      result.current.refetch();
    });
    expect(result.current).toMatchObject({
      isLoading: true,
      isError: false,
      error: undefined,
    });
    await act(async () => {
      second.resolve('recovered');
    });
    expect(result.current).toMatchObject({
      isSuccess: true,
      data: 'recovered',
      error: undefined,
    });
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a superseded request that later %ss',
    async (settle) => {
      const first = deferred<string>();
      const second = deferred<string>();
      const fetcher = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const { result } = renderHook(() => useApi<string>(fetcher));
      act(() => {
        result.current.refetch();
      });
      await act(async () => {
        second.resolve('new');
      });
      await act(async () => {
        first[settle]('old');
      });
      expect(result.current).toMatchObject({
        isSuccess: true,
        data: 'new',
        isError: false,
      });
    },
  );

  it('invalidates the first StrictMode effect even after the second effect mounts', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useApi<string>(fetcher), {
      wrapper: StrictMode,
    });
    await act(async () => {
      second.resolve('current');
    });
    await act(async () => {
      first.resolve('stale');
    });
    expect(result.current.data).toBe('current');
  });

  it('does not load after unmount through a retained refetch callback', async () => {
    const pending = deferred<string>();
    const fetcher = vi.fn(() => pending.promise);
    const { result, unmount } = renderHook(() => useApi(fetcher));
    const refetch = result.current.refetch;
    unmount();
    act(() => {
      refetch();
    });
    await act(async () => {
      pending.resolve('late');
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps automatic loading mount-only for inline fetchers and refetches with current props', async () => {
    const fetcher = vi.fn(async (value: string) => value);
    const { result, rerender } = renderHook(
      ({ value }) => useApi(() => fetcher(value)),
      {
        initialProps: { value: 'first' },
      },
    );
    await act(async () => {});
    rerender({ value: 'second' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.refetch();
    });
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('second');
  });
});
