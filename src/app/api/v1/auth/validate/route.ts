import { NextRequest, NextResponse } from 'next/server';

import { ApiKeysService } from '../../logic/services/api-keys.service';
import { isLocalTargetEnv } from '@/libs/utils/env';

// FIXME: DANGER! IT'S ONLY FOR TESTING!!! Shouldn't be available outside dev
export const POST = async (request: NextRequest) => {
  if (!isLocalTargetEnv) {
    return NextResponse.json('You shall not pass', { status: 400 });
  }
  const body = await request.json();
  const { apiKey } = body;

  const apiKeysService = new ApiKeysService();

  const extractedData = apiKeysService.extractDataFromApiKey(apiKey);

  return NextResponse.json(extractedData);
};
