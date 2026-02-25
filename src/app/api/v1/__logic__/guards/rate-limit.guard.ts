import { NextRequest } from 'next/server';
import { isLocalTargetEnv } from '@/libs/utils/env';
import { getRedisInstance } from '@/app/lib/services/redis';
import { ApiContext } from '../types/ApiContext';

export class LimitExceededException extends Error {}

const redis = getRedisInstance();
const IP_LIMIT = isLocalTargetEnv ? 30 : 10;
const KEY_LIMIT = isLocalTargetEnv ? 15 : 5;
const DURATION = 60; // seconds

export const rateLimit = async (
  request: NextRequest,
  apiContext?: ApiContext
) => {
  const url = request.nextUrl.pathname;
  const isApiUrl = url.startsWith('/api/v1');
  if (!isApiUrl) return;

  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const ipKey = `rate-limit:ip:${ip}`;
  const ipCount = await redis.incrWithExpire(ipKey, DURATION);

  if (ipCount > IP_LIMIT) {
    throw new LimitExceededException();
  }

  if (apiContext?.keyId) {
    const keyKey = `rate-limit:key:${apiContext.keyId}`;
    const keyCount = await redis.incrWithExpire(keyKey, DURATION);

    if (keyCount > KEY_LIMIT) {
      throw new LimitExceededException();
    }
  }
};
