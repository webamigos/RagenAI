import { NextRequest, NextResponse } from 'next/server';

import { ApiKeysService } from '../../__logic__/services/api-keys.service';
import { isLocalTargetEnv } from '@/libs/utils/env';
import { API_HEADER } from '../../__logic__/guards/api-key.guard';
import { ApiKey } from '../../__logic__/types/brand';

// FIXME: DANGER! IT'S ONLY FOR TESTING!!! Shouldn't be available outside dev
export const POST = async (request: NextRequest) => {
  if (!isLocalTargetEnv) {
    return NextResponse.json('You shall not pass', { status: 400 });
  }
  const headers = request.headers;
  const apiKeyHeaderValue = headers.get(API_HEADER) as ApiKey;

  const apiKeysService = new ApiKeysService();

  const extractedData = apiKeysService.extractDataFromApiKey(apiKeyHeaderValue);

  return NextResponse.json(extractedData);
};
