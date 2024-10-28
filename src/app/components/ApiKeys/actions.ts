'use server';

import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';

import { fetchApiKeysFromDb } from '@/app/lib/services/apiKeys';
import {
  setSentryContext,
  setSentryOrganizationTag,
  setSentryServiceTag,
  setSentrySessionTag,
  setSentryUserId,
} from '@/app/lib/services/sentry';

const serviceName = 'apiKeysList';

export const fetchApiKeys = async () => {
  const { orgId, userId, sessionId } = auth();

  if (!orgId) {
    return {
      success: false,
      message: 'Organization not found',
    };
  }

  try {
    setSentryUserId(userId);
    setSentrySessionTag(sessionId);
    setSentryOrganizationTag(orgId);
    setSentryServiceTag(serviceName);
    setSentryContext(serviceName, 'fetchApiKeys', {
      organization: orgId,
    });

    const keys = await fetchApiKeysFromDb(orgId);

    return {
      success: true,
      payload: keys,
    };
  } catch (error) {
    Sentry.captureException(error);

    return {
      success: false,
      message: 'Failed to fetch keys',
    };
  }
};
