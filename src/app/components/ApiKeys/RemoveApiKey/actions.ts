'use server';

import * as Sentry from '@sentry/nextjs';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';
import {
  setSentryServiceTag,
  setSentryTagsAndContextForClerk,
} from '@/app/lib/services/sentry';
import { removeApiKeyFromDb } from '@/app/lib/services/apiKeys';
import { ApiKey } from '@prisma/client';

const serviceName = 'removeApiKey';

export const removeApiKey = async (publicKeyId: ApiKey['public_id']) => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    return {
      success: false,
      message: 'Organization or user not found',
    };
  } else if (!publicKeyId) {
    return {
      success: false,
      message: 'Key not found',
    };
  }

  const userId = user.id;

  try {
    setSentryServiceTag(serviceName);
    setSentryTagsAndContextForClerk({ sessionId: undefined, orgId, userId });

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
