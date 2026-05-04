import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
const mockSetEx = vi.hoisted(() => vi.fn<() => Promise<void>>());
const mockGetRedisInstance = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/services/redis', () => ({
  getRedisInstance: mockGetRedisInstance,
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { withRedisCache } from '../redis-cache';

const mockRedis = {
  get: mockGet,
  setEx: mockSetEx,
};

describe('withRedisCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisInstance.mockReturnValue(mockRedis);
  });

  it('returns cached value on cache hit without calling fn', async () => {
    const cached = { id: 1, name: 'test' };
    mockGet.mockResolvedValue(JSON.stringify(cached));

    const fn = vi.fn<() => Promise<typeof cached>>();
    const result = await withRedisCache('my-key', 60, fn);

    expect(result).toEqual(cached);
    expect(fn).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledWith('my-key');
    expect(mockSetEx).not.toHaveBeenCalled();
  });

  it('calls fn and stores result on cache miss', async () => {
    mockGet.mockResolvedValue(null);
    mockSetEx.mockResolvedValue(undefined);

    const data = { id: 2, value: 'fresh' };
    const fn = vi.fn<() => Promise<typeof data>>().mockResolvedValue(data);

    const result = await withRedisCache('miss-key', 300, fn);

    expect(result).toEqual(data);
    expect(fn).toHaveBeenCalledOnce();
    expect(mockSetEx).toHaveBeenCalledWith(
      'miss-key',
      300,
      JSON.stringify(data),
    );
  });

  it('falls back to fn when Redis is unavailable (getRedisInstance returns null)', async () => {
    mockGetRedisInstance.mockReturnValue(null);

    const data = { fallback: true };
    const fn = vi.fn<() => Promise<typeof data>>().mockResolvedValue(data);

    const result = await withRedisCache('no-redis-key', 60, fn);

    expect(result).toEqual(data);
    expect(fn).toHaveBeenCalledOnce();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('falls back to fn when Redis.get throws', async () => {
    mockGet.mockRejectedValue(new Error('Redis connection error'));

    const data = { recovered: true };
    const fn = vi.fn<() => Promise<typeof data>>().mockResolvedValue(data);

    const result = await withRedisCache('error-key', 60, fn);

    expect(result).toEqual(data);
    expect(fn).toHaveBeenCalledOnce();
    expect(mockSetEx).not.toHaveBeenCalled();
  });
});
