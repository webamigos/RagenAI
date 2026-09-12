import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../lib/retry';

describe('withRetry', () => {
  it('returns the first successful value without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and returns the later success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { delayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error once the attempts are used up', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('still down'));
    await expect(withRetry(fn, { attempts: 2, delayMs: 0 })).rejects.toThrow(
      'still down',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('reports each retry so a flaky run is visible in the log', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');
    await withRetry(fn, { delayMs: 0, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toBe(1);
  });
});
