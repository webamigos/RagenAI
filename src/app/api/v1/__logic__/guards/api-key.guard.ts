import { type NextRequest } from 'next/server';

import { ApiKeysService } from '../services/api-keys.service';
import { type ApiKey } from '../types/brand';
import { type ApiContext } from '../types/ApiContext';

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

  return { orgId, userId, projectId, keyId };
};
