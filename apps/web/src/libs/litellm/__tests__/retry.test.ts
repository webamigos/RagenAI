import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { withLiteLLMRetry } from '../retry';

describe('withLiteLLMRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the value when the first attempt succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withLiteLLMRetry('test.op', {}, fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a 502 and returns the eventual success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to x: 502 bad gateway'))
      .mockResolvedValue('ok');

    const result = await withLiteLLMRetry('test.op', {}, fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on a network error (no HTTP status in message)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue('ok');

    const result = await withLiteLLMRetry('test.op', {}, fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a 4xx (caller-fixable)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error('Failed to x: 400 bad request'));

    await expect(withLiteLLMRetry('test.op', {}, fn)).rejects.toThrow(/400/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after MAX_ATTEMPTS and surfaces the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failed to x: 503 down'));

    await expect(withLiteLLMRetry('test.op', {}, fn)).rejects.toThrow(/503/);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
