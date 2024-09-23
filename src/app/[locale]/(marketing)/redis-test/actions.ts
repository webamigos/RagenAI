'use server';

import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export const increase = async () => {
  const counter = await redis.incr('counter');
  return { counter };
};

export const decrease = async () => {
  const counter = await redis.decr('counter');
  return { counter };
};
