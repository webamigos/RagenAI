import { NextRequest } from 'next/server';
import { ApiKeysService } from '../services/api-keys.service';
import { ApiKey } from '../types/brand';

const API_HEADER = 'x-api-key';

export class HttpException extends Error {}
export class UnauthorizedException extends HttpException {}

export const canActivate = async (request: NextRequest) => {
  const headers = request.headers;
  const apiKeyHeader = headers.get(API_HEADER);

  if (!apiKeyHeader) {
    throw new UnauthorizedException();
  }

  const apiKeyValue = apiKeyHeader as ApiKey;
  const apiKeysService = new ApiKeysService();

  const { orgId, projectId, keyId } =
    apiKeysService.extractDataFromApiKey(apiKeyValue);

  return { orgId, projectId, keyId };
};
