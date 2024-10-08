import Redis from 'ioredis';
import { logger } from '../utils/logger';

class RedisService {
  private static instance: RedisService;
  private client: Redis;

  private constructor() {
    logger.info('Started Redis instance');
    this.client = new Redis(process.env.REDIS_URL!);
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(key: string, hash: Record<string, string>): Promise<number> {
    return this.client.hset(key, hash);
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

export const getRedisInstance = () => RedisService.getInstance();
