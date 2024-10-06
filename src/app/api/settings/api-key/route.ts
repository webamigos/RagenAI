import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuth } from '@clerk/nextjs/server';

import { logger } from '@/app/lib/utils/logger';
import { redis } from '@/libs/db/redis';

const ApiKeySchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
});

export async function GET(request: NextRequest) {
  try {
    const { userId } = getAuth(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const apiKey = await redis.hget(`user:${userId}:api_keys`, 'openai');

      if (!apiKey) {
        return NextResponse.json(
          { message: 'No API Key found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ apiKey });
    } catch (redisError) {
      logger.error('Redis error: Failed to fetch API key', redisError);
      return NextResponse.json(
        { error: 'Failed to fetch API Key' },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Failed to fetch API Key:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API Key' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = getAuth(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { apiKey } = ApiKeySchema.parse(body);

    try {
      await redis.hset(`user:${userId}:api_keys`, { openai: apiKey });
    } catch (redisError) {
      throw new Error('Redis error: Failed to save API key');
    }

    return NextResponse.json({ message: 'API Key saved successfully' });
  } catch (error) {
    logger.error('Failed to save API Key:', error);
    return NextResponse.json(
      { error: 'Failed to save API Key' },
      { status: 500 }
    );
  }
}
