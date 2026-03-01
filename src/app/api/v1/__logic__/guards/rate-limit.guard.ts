import { type NextRequest } from 'next/server';
import { isLocalTargetEnv } from '@/libs/utils/env';
import { RedisService } from '@/app/lib/services/redis';
import { logger } from '@/app/lib/utils/logger';
import { type ApiContext } from '../types/ApiContext';

export class LimitExceededException extends Error {}

const IP_LIMIT = isLocalTargetEnv ? 30 : 10;
const KEY_LIMIT = isLocalTargetEnv ? 15 : 5;
const DURATION = 60; // seconds

export const rateLimit = async (
  request: NextRequest,
  apiContext?: ApiContext,
) => {
  const url = request.nextUrl.pathname;
  const isApiUrl = url.startsWith('/api/v1');
  if (!isApiUrl) {
    return;
  }

  const redis = RedisService.getInstance();
  if (!redis) {
    return;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1';

  try {
    const ipKey = `rate-limit:ip:${ip}`;
    const ipCount = await redis.incrWithExpire(ipKey, DURATION);

    if (ipCount > IP_LIMIT) {
      throw new LimitExceededException();
    }
  } catch (error) {
    if (error instanceof LimitExceededException) {
      throw error;
    }
    logger.warn(
      { err: error, ip },
      'Redis rate-limit check failed for IP, allowing request',
    );
  }

  if (apiContext?.keyId) {
    try {
      const keyKey = `rate-limit:key:${apiContext.keyId}`;
      const keyCount = await redis.incrWithExpire(keyKey, DURATION);

      if (keyCount > KEY_LIMIT) {
        throw new LimitExceededException();
      }
    } catch (error) {
      if (error instanceof LimitExceededException) {
        throw error;
      }
      logger.warn(
        { err: error, keyId: apiContext.keyId },
        'Redis rate-limit check failed for API key, allowing request',
      );
    }
  }
};
