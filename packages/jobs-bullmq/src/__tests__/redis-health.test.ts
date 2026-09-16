import { describe, expect, it, vi } from 'vitest';

import { assertNoEviction, EVICTION_MESSAGE } from '../redis-health.js';

/**
 * Queue state is the data — there is no database behind it to rebuild from —
 * so an evicting Redis deletes work at random under memory pressure, silently.
 * Managed instances default to eviction often enough that this is a boot check
 * rather than a runbook line.
 */
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('assertNoEviction', () => {
  it('accepts noeviction, in ioredis’s array shape', async () => {
    const client = {
      config: vi.fn(async () => ['maxmemory-policy', 'noeviction']),
    };

    await expect(assertNoEviction(client, log)).resolves.toBeUndefined();
  });

  it('accepts noeviction in the object shape a RESP3 client returns', async () => {
    const client = {
      config: vi.fn(async () => ({ 'maxmemory-policy': 'noeviction' })),
    };

    await expect(assertNoEviction(client, log)).resolves.toBeUndefined();
  });

  it.each(['allkeys-lru', 'volatile-ttl', 'allkeys-random'])(
    'refuses to start against %s',
    async (policy) => {
      const client = {
        config: vi.fn(async () => ['maxmemory-policy', policy]),
      };

      await expect(assertNoEviction(client, log)).rejects.toThrow(
        EVICTION_MESSAGE,
      );
    },
  );

  it('names the policy it found, so the message is actionable', async () => {
    const client = {
      config: vi.fn(async () => ['maxmemory-policy', 'allkeys-lru']),
    };

    await expect(assertNoEviction(client, log)).rejects.toThrow(/allkeys-lru/);
  });

  /**
   * A managed Redis that forbids `CONFIG GET` is a normal deployment. Refusing
   * to boot because a diagnostic is unavailable would be a check costing more
   * than it catches — unreadable warns, readable-and-wrong refuses.
   */
  it('warns and continues when the policy cannot be read', async () => {
    const client = {
      config: vi.fn(async () => {
        throw new Error('ERR unknown command CONFIG');
      }),
    };

    await expect(assertNoEviction(client, log)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('warns and continues on an empty answer rather than reading it as unsafe', async () => {
    const client = { config: vi.fn(async () => ['maxmemory-policy', '']) };

    await expect(assertNoEviction(client, log)).resolves.toBeUndefined();
  });
});
