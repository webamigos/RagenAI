import { NextRequest } from 'next/server';

import { rateLimit } from '../guards/rate-limit.guard';
import { apiKeyGuard } from '../guards/api-key.guard';

export const getApiContext = async (request: NextRequest) => {
  const apiContext = apiKeyGuard(request);
  await rateLimit(request, apiContext);
  return apiContext;
};
