import { NextRequest } from 'next/server';

import { rateLimit } from '../guards/rate-limit.guard';
import { canActivate } from '../guards/api-key.guard';

export const getApiContext = async (request: NextRequest) => {
  await rateLimit(request);
  return canActivate(request);
};
