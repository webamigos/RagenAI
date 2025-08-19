'use server';

import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';
import {
  setSentryServiceTag,
  setSentryTagsAndContextForClerk,
} from '@/app/lib/services/sentry';
import { removeApiKeyFromDb } from '@/app/lib/services/apiKeys';
import { ApiKey } from '@prisma/client';

const serviceName = 'removeApiKey';

export const removeApiKey = async (publicKeyId: ApiKey['public_id']) => {
  const { orgId, userId, sessionId } = await auth();

  if (!orgId) {
    return {
      success: false,
      message: 'Organization not found',
    };
  } else if (!publicKeyId) {
    return {
      success: false,
      message: 'Key not found',
    };
  }

  try {
    setSentryServiceTag(serviceName);
    setSentryTagsAndContextForClerk({ sessionId, orgId, userId });

    await removeApiKeyFromDb(orgId, publicKeyId);

    return {
      success: true,
    };
  } catch (error) {
    Sentry.captureException(error);

    return {
      success: false,
    };
  }
};
