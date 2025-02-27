import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { setSentryContext, setSentryServiceTag } from './sentry';

export class RedisService {
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
      logger.error({ err: error }, 'Error retrieving data from Redis');
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
      logger.error({ err: error }, 'Error retrieving data from Redis');
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
      logger.error({ err: error }, 'Error saving data to Redis');
      return { success: false, status: 'Failed to save data to Redis' };
    }
  }

  async set(key: string, value: string) {
    try {
      setSentryContext('EXTRA_DATA', {
        key,
        value,
      });
      return await this.client.set(key, value);
    } catch (error) {
      logger.error({ err: error }, 'Error setting data to Redis');
    }
  }

  async get(key: string) {
    try {
      setSentryContext('EXTRA_DATA', {
        key,
      });
      return await this.client.get(key);
    } catch (error) {
      logger.error({ err: error }, 'Error removing key from Redis');
    }
  }

  async del(key: string) {
    try {
      setSentryContext('EXTRA_DATA', {
        key,
      });
      return await this.client.del(key);
    } catch (error) {
      logger.error({ err: error }, 'Error removing key from Redis');
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

export const getRedisInstance = () => RedisService.getInstance();
