import { NextRequest } from 'next/server';

import { ApiKeysService } from '../services/api-keys.service';
import { ApiKey } from '../types/brand';
import { ApiContext } from '../types/ApiContext';
import { setSentryContext } from '@/app/lib/services/sentry';

export const API_HEADER = 'x-api-key';

export class HttpException extends Error {}
export class UnauthorizedException extends HttpException {}

export const apiKeyGuard = (request: NextRequest): ApiContext => {
  const headers = request.headers;
  const apiKeyHeaderValue = headers.get(API_HEADER) as ApiKey;

  if (!apiKeyHeaderValue) {
    throw new UnauthorizedException();
  }

  const apiKeysService = new ApiKeysService();

  const { orgId, userId, projectId, keyId } =
    apiKeysService.extractDataFromApiKey(apiKeyHeaderValue);

  setSentryContext('EXTRA_DATA', {
    orgId,
    userId,
    projectId,
    keyId,
  });

  return { orgId, userId, projectId, keyId };
};
