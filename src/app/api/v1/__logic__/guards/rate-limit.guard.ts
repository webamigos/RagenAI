// IMO better place for that is middleware BUT it's not allowed to use ioredis there
// Workaround is to use upstash redis in middleware but it's additional external service
import Redis from 'ioredis';
import { NextRequest } from 'next/server';
import { isLocalTargetEnv } from '@/libs/utils/env';

export class LimitExceededException extends Error {}

const redis = new Redis(process.env.REDIS_URL!);
const LIMIT = isLocalTargetEnv ? 15 : 5; // 5 requests TODO: move to env vars?
const DURATION = 60; // within 60 seconds TODO: move to env vars?

export const rateLimit = async (request: NextRequest) => {
  const url = request.nextUrl.pathname;
  const isApiUrl = url.startsWith('/api/v1');
  if (isApiUrl) {
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const key = `rate-limit:${ip}`;

    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, DURATION);
    }

    if (current > LIMIT) {
      throw new LimitExceededException();
    }
  }
};
