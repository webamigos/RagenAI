'use server';

import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';
import {
  setSentryContext,
  setSentryOrganizationTag,
  setSentryServiceTag,
  setSentrySessionTag,
  setSentryUserId,
} from '@/app/lib/services/sentry';
import { removeApiKeyFromDb } from '@/app/lib/services/apiKeys';
import { ApiKey } from '@prisma/client';

const serviceName = 'removeApiKey';

export const removeApiKey = async (keyId: ApiKey['id']) => {
  const { orgId, userId, sessionId } = auth();

  if (!orgId) {
    return {
      success: false,
      message: 'Organization not found',
    };
  } else if (!keyId) {
    return {
      success: false,
      message: 'Key not found',
    };
  }

  try {
    setSentryUserId(userId);
    setSentrySessionTag(sessionId);
    setSentryOrganizationTag(orgId);
    setSentryServiceTag(serviceName);
    setSentryContext(serviceName, 'removeApiKey', {
      organization: orgId,
    });

    await removeApiKeyFromDb(orgId, keyId);

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
