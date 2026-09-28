import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/services/redis', () => ({
  RedisService: { getInstance: () => null },
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getParserStatusQuery } from '../get-parser-status-query';

const published = (up: boolean, checkedAt = new Date().toISOString()) => ({
  get: vi.fn(async () =>
    JSON.stringify({ up, since: '2026-09-28T09:15:00.000Z', checkedAt }),
  ),
});

describe('getParserStatusQuery (Docling spec C1)', () => {
  it('reads up, and down with since when', async () => {
    await expect(getParserStatusQuery(published(true))).resolves.toEqual({
      state: 'up',
    });
    await expect(getParserStatusQuery(published(false))).resolves.toEqual({
      state: 'down',
      since: '2026-09-28T09:15:00.000Z',
    });
  });

  it('reads the key the worker writes', async () => {
    const redis = published(true);
    await getParserStatusQuery(redis);
    expect(redis.get).toHaveBeenCalledWith('ragen:docling:status');
  });

  // "Unknown" is not an outage, and is never shown as one.
  it.each([
    ['no Redis', null],
    ['nothing published', { get: async () => null }],
    ['a stale status', published(false, '2020-01-01T00:00:00.000Z')],
    [
      'a failed read',
      {
        get: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
    ],
  ])('is unknown with %s', async (_, redis) => {
    await expect(getParserStatusQuery(redis)).resolves.toEqual({
      state: 'unknown',
    });
  });
});
