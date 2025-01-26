import { NextRequest, NextResponse } from 'next/server';
import { ApiKeysService } from './__logic__/services/api-keys.service';
import { KeyId, OrgId, ProjectId } from './__logic__/types/brand';

export const dynamic = 'force-dynamic';

// TODO: it's experimental endpoint - this logic is to remove
// You can verify if generating keys works correctly
export const GET = async (request: NextRequest) => {
  const headers = request.headers;
  const apiKeyHeader = headers.get('x-api-key');
  const apiKeysService = new ApiKeysService();

  const data = {
    orgId: 'org_2s7TXecQmPYHPwYpQKw9UmPRcmt' as OrgId,
    projectId: 456 as ProjectId,
    keyId: 789 as KeyId,
  };

  const hashResult = await apiKeysService.createAndHash(data);
  // eslint-disable-next-line no-console
  console.log({ hashResult });

  const validateResult = await apiKeysService.validate(
    hashResult.apiKey,
    hashResult.hashedKey
  );
  // eslint-disable-next-line no-console
  console.log({ validateResult });

  const extractedKey = apiKeysService.extractDataFromApiKey(hashResult.apiKey);
  // eslint-disable-next-line no-console
  console.log({ extractedKey });

  const loadedApiKey = await apiKeysService.loadApiKey(789 as KeyId);
  // eslint-disable-next-line no-console
  console.log({ loadedApiKey });

  return NextResponse.json({ apiKey: hashResult.apiKey });

  // return NextResponse.json({ status: 'ok' });
};
