import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { setSentryContext, setSentryServiceTag } from './sentry';
import { Sentry } from 'pino-sentry';

class RedisService {
  private static instance: RedisService;
  private client: Redis;
  private serviceName = 'redis';

  private constructor() {
    logger.info('Started Redis instance');
    setSentryServiceTag(this.serviceName);
    this.client = new Redis(process.env.REDIS_URL!);
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      setSentryContext('EXTRA_DATA', {
        key,
        field,
      });
      const result = await this.client.hget(key, field);
      return result;
    } catch (error) {
      Sentry.captureException(error);
      logger.error(`Redis error (hget): ${error}`);
      throw new Error('Failed to retrieve data from Redis');
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      setSentryContext('EXTRA_DATA', {
        key,
      });
      return await this.client.hgetall(key);
    } catch (error) {
      Sentry.captureException(error);
      logger.error('Redis error (hgetall) %o', error);
      throw new Error('Failed to retrieve data from Redis');
    }
  }

  async hsetWithStatus(
    key: string,
    hash: Record<string, string>
  ): Promise<{ success: boolean; status: string }> {
    try {
      setSentryContext('EXTRA_DATA', {
        key,
        hash,
      });
      const result = await this.client.hset(key, hash);
      if (result > 0) {
        return { success: true, status: `${hash} saved successfully` };
      } else {
        return { success: true, status: `${hash} updated successfully` };
      }
    } catch (error) {
      Sentry.captureException(error);
      logger.error(`Redis error (hset): ${error}`);
      return { success: false, status: 'Failed to save data to Redis' };
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

export const getRedisInstance = () => RedisService.getInstance();
