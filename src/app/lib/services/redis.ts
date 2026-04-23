import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class RedisService {
  private static instance: RedisService | null = null;
  private static disabledLogged = false;
  private client: Redis;

  private constructor() {
    logger.info('Started Redis instance');
    this.client = new Redis(process.env.REDIS_URL!);
  }

  public static getInstance(): RedisService | null {
    if (!process.env.REDIS_URL) {
      if (!RedisService.disabledLogged) {
        logger.info('REDIS_URL not set — Redis disabled');
        RedisService.disabledLogged = true;
      }
      return null;
    }
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      logger.error(
        { err: error, key, field },
        'Error retrieving hash field from Redis',
      );
      throw new Error('Failed to retrieve data from Redis');
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logger.error({ err: error, key }, 'Error retrieving hash from Redis');
      throw new Error('Failed to retrieve data from Redis');
    }
  }

  async hset(key: string, hash: Record<string, string>): Promise<number> {
    try {
      return await this.client.hset(key, hash);
    } catch (error) {
      logger.error({ err: error, key }, 'Error saving hash to Redis');
      throw new Error('Failed to save data to Redis');
    }
  }

  async set(key: string, value: string): Promise<string> {
    try {
      const result = await this.client.set(key, value);
      return result;
    } catch (error) {
      logger.error({ err: error, key }, 'Error setting key in Redis');
      throw new Error('Failed to set data in Redis');
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error({ err: error, key }, 'Error getting key from Redis');
      throw new Error('Failed to get data from Redis');
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error({ err: error, key }, 'Error deleting key from Redis');
      throw new Error('Failed to delete data from Redis');
    }
  }

  /**
   * Atomically increment a key and set expiry if it's a new key.
   * Uses a Lua script to avoid the INCR + EXPIRE race condition.
   * Returns the current count after incrementing.
   */
  async incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    try {
      return (await this.client.eval(luaScript, 1, key, ttlSeconds)) as number;
    } catch (error) {
      logger.error({ err: error, key }, 'Error incrementing key in Redis');
      throw new Error('Failed to increment key in Redis');
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

export const getRedisInstance = () => RedisService.getInstance();
