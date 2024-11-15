'use server';

import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';

import {
  createOrganizationWithDefaultProject,
  fetchApiKeysFromDb,
} from '@/app/lib/services/apiKeys';
import {
  setSentryServiceTag,
  setSentryTagsAndContextForClerk,
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
    setSentryServiceTag(serviceName);
    setSentryTagsAndContextForClerk({ sessionId, orgId, userId });

    const keys = await fetchApiKeysFromDb(orgId);

    return {
      success: true,
      payload: keys,
    };
  } catch (error) {
    Sentry.captureException(error);

    await createOrganizationWithDefaultProject(orgId);

    return {
      success: true,
      payload: [],
    };
  }
};
