import { NextRequest } from 'next/server';
import { rateLimit } from './rate-limit.guard';
import { canActivate } from './api-key.guard';

export const verifyRequest = async (request: NextRequest) => {
  await rateLimit(request);
  return canActivate(request);
};
