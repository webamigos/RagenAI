import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRetry } from '../retry';
import type { LiteLLMLogger } from '../logger';

const logger: LiteLLMLogger = { warn: vi.fn(), error: vi.fn() };
const withRetry = createRetry(logger);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('withLiteLLMRetry', () => {
  it('returns the value without retrying when the call succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(withRetry('team.info', {}, fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('retries a 5xx and succeeds on a later attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to update team: 503 busy'))
      .mockResolvedValue('ok');

    await expect(withRetry('team.update', {}, fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('gives up after three attempts and rethrows', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error('Failed to update team: 500 boom'));

    await expect(withRetry('team.update', {}, fn)).rejects.toThrow('500 boom');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  /**
   * A 4xx is caller-fixable — a bad team id, a rejected budget — so retrying
   * only delays the error the caller needs to see.
   */
  it('retries a 429, which is what the backoff is for', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to update team: 429 slow down'))
      .mockResolvedValue('ok');

    await expect(withRetry('team.update', {}, fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each([[400], [401], [404], [422]])(
    'does not retry a %i',
    async (status) => {
      const fn = vi
        .fn()
        .mockRejectedValue(new Error(`Failed to update team: ${status} nope`));

      await expect(withRetry('team.update', {}, fn)).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );

  // A thrown value with no parseable status is treated as a network fault.
  it.each([
    ['an AbortError', new Error('The operation was aborted')],
    ['a bare string', 'ECONNREFUSED'],
    ['a TypeError from fetch', new TypeError('fetch failed')],
  ])('retries %s', async (_label, thrown) => {
    const fn = vi.fn().mockRejectedValue(thrown);

    await expect(withRetry('team.info', {}, fn)).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('carries the caller context into the log line', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x: 500 y'));

    await expect(
      withRetry('team.update', { teamId: 't-1' }, fn),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 't-1', operation: 'team.update' }),
      expect.stringContaining('not retrying'),
    );
  });

  /**
   * Retryability is decided by scraping the status out of the message, so the
   * `...: <status> <text>` shape every client function formats is load-bearing.
   * A message without it becomes "network error" and is retried three times.
   */
  it('treats a message with no embedded status as retryable', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Bad request'));

    await expect(withRetry('team.update', {}, fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
