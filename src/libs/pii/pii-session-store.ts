import { getRedisInstance } from '@/app/lib/services/redis';
import { logger } from '@/app/lib/utils/logger';

const KEY_PREFIX = 'pii:';

class PiiSessionStore {
  async save(
    threadId: string,
    aliasMap: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void> {
    if (Object.keys(aliasMap).length === 0) {
      return;
    }

    const redis = getRedisInstance();
    if (!redis) {
      throw new Error(
        'Redis unavailable — cannot store PII alias map (fail-closed)',
      );
    }

    await redis.setEx(
      `${KEY_PREFIX}${threadId}`,
      JSON.stringify(aliasMap),
      ttlSeconds,
    );
    logger.debug(
      { threadId, aliasCount: Object.keys(aliasMap).length },
      'PII alias map saved',
    );
  }

  async get(threadId: string): Promise<Record<string, string>> {
    const redis = getRedisInstance();
    if (!redis) {
      return {};
    }

    const raw = await redis.get(`${KEY_PREFIX}${threadId}`);
    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as Record<string, string>;
  }

  async del(threadId: string): Promise<void> {
    const redis = getRedisInstance();
    if (!redis) {
      return;
    }
    await redis.del(`${KEY_PREFIX}${threadId}`);
  }
}

export const piiSessionStore = new PiiSessionStore();
