import { type NextRequest } from 'next/server';

import db from '@ragenai/prisma-client';
import { ApiKeysService } from '../services/api-keys.service';
import { type ApiKey } from '../types/brand';
import { type ApiContext } from '../types/ApiContext';

export const API_HEADER = 'x-api-key';

export class HttpException extends Error {}
export class UnauthorizedException extends HttpException {}

export const apiKeyGuard = async (
  request: NextRequest,
): Promise<ApiContext> => {
  const headers = request.headers;
  const apiKeyHeaderValue = headers.get(API_HEADER) as ApiKey;

  if (!apiKeyHeaderValue) {
    throw new UnauthorizedException();
  }

  const apiKeysService = new ApiKeysService();

  const { orgId, userId, projectId, keyId } =
    apiKeysService.extractDataFromApiKey(apiKeyHeaderValue);

  const apiKeyRecord = await db.apiKey.findUnique({
    where: { id: keyId },
    select: {
      id: true,
      organization_id: true,
      hashed_value: true,
    },
  });

  if (!apiKeyRecord) {
    throw new UnauthorizedException();
  }

  if (apiKeyRecord.organization_id !== orgId) {
    throw new UnauthorizedException();
  }

  if (apiKeyRecord.hashed_value) {
    const isValid = await apiKeysService.validate(
      apiKeyHeaderValue,
      apiKeyRecord.hashed_value,
    );
    if (!isValid) {
      throw new UnauthorizedException();
    }
  }

  return { orgId, userId, projectId, keyId };
};
