import { type NextRequest } from 'next/server';

import { rateLimit } from '../guards/rate-limit.guard';
import { apiKeyGuard } from '../guards/api-key.guard';

export const getApiContext = async (request: NextRequest) => {
  await rateLimit(request);
  return await apiKeyGuard(request);
};
