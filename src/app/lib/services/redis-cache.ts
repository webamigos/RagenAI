import { getRedisInstance } from '@/app/lib/services/redis';
import { logger } from '@/app/lib/utils/logger';

export async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedisInstance();

  if (!redis) {
    return fn();
  }

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.warn(
      { err, key },
      'Redis cache GET failed — falling back to source',
    );
    return fn();
  }

  const result = await fn();

  try {
    await redis.setEx(key, JSON.stringify(result), ttlSeconds);
  } catch (err) {
    logger.warn(
      { err, key },
      'Redis cache SET failed — result returned without caching',
    );
  }

  return result;
}
